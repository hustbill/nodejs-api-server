/**
 * Retrieve authentication token
 */

var async = require('async');
var util = require('util');
var utils = require('../../../../../lib/utils');
var daos = require('../../../../../daos');
var u = require('underscore');

/**
 * check parameter values from the request
 *
 * @method checkParameter
 * @param context {object} request's context object
 * @param callback {Function} callback function.
 */
function checkParameter(context, callback) {
    var input = context.input;
    var logger = context.logger;
    var client = context.readDatabaseClient;
    var sqlStmt;
    var sqlParams;
    var error;

    if (input.clientId === undefined) {
        error = new Error('client id is missing');
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (input.userId === undefined) {
        error = new Error('user is missing');
        error.statusCode = 400;
        callback(error);
        return;
    }

    callback();
}

function getUserInfo(context, callback) {
    var logger = context.logger;
    var userDao = daos.createDao('User', context);
    var userId = context.input.userId;
    var userData = context.userData;

    async.waterfall([
        function (callback) {
            userDao.getById(userId, callback);
        },

        function (user, callback) {
            userData.userId = user.id;
            userData.login = user.login;

            userDao.getDistributorOfUser(user, callback);
        },

        function (distributor, callback) {
            userData.distributorId = distributor.id;

            callback();
        }
    ], callback);
}


/**
 * get base64 encoded access token
 *
 * @method getToken
 * @param context {object} request's context object
 * @param callback {Function} callback function.
 */
function getToken(context, callback) {
    var hmacContent;
    var input = context.input;
    var userData = context.userData;
    var logger = context.logger;
    var currentTime = new Date().getTime();
    var rawData = [
            userData.distributorId,
            userData.userId,
            userData.login,
            input.deviceId,
            currentTime,
            input.clientId
        ].join('::');

    try {
        userData.hmacKey = require('crypto').randomBytes(16).toString('base64');
        userData.accessToken = utils.getAccessToken(userData.hmacKey, rawData);
        logger.trace('hmac key %s and raw data %s', userData.hmacKey, rawData);
        logger.trace("accessToken: " + userData.accessToken);
        callback(null, userData.accessToken);
    } catch (ex) {
        callback(ex);
    }
}

/**
 * save token related data in database
 *
 * @method saveToken
 * @param context {object} request's context object
 * @param callback {Function} callback function.
 */
function saveToken(context, callback) {
    var currentTime = new Date();
    var client = context.databaseClient;
    var logger = context.logger;
    var input = context.input;
    var userData = context.userData;

    async.parallel({
        insert_1: function (inner_callback) {
            var description = "oauth token",
                sqlStmt = 'SELECT mobile.save_oauth_token($1, $2, $3, $4, $5, true)',
                sqlParams = [
                    userData.hmacKey,
                    userData.distributorId,
                    input.clientId,
                    input.deviceId,
                    description
                ];

            utils.dbQueryWriteDatabase(context, sqlStmt, sqlParams, inner_callback);
        },
        insert_2: function (inner_callback) {
            var description = (input.description === undefined) ? "device info" : input.description,
                sqlStmt = 'SELECT mobile.save_device($1, $2, $3, $4, $5, true)',
                sqlParams = [
                    userData.distributorId,
                    input.deviceId,
                    input.deviceOS,
                    input.pushNotificationToken,
                    description
                ];

            utils.dbQueryWriteDatabase(context, sqlStmt, sqlParams, inner_callback);
        }
    }, function (error, result) {
        if (error) {
            callback(error);
        } else {
            callback(null, result);
        }
    });
}


/**
 * add user login track
 * @param {Object} context Request's context object
 * @param {Function} callback Callback function
 * @return {undefined}
 */
function addUserTrack (context, callback) {
    var userTrackDao = daos.createDao('UserTrack', context);
    var input = context.input;
    var userData = context.userData;
    var userTrack = {
            userId: userData.userId,
            signInAt: new Date(),
            signInIP: context.remoteAddress
            // signInIP : input.forwardedForIP,
        };

    userTrackDao.addUserTrack(userTrack, function (error) {
        callback(error);
    });
}

/**
 * add admin user token request log
 * @param options {Object}
 *   options:
 *     context {Object} Request's context
 *     admin_login {String} Admin user login
 *     admin_user_id {Number} Admin user id
 *     user_id {Number} User id
 *     source_ip {String} The admin client ip
 * @param {Function} callback Callback function
 * @return {undefined}
 */
function addAdminUserTokenRequest (options, callback) {
    var context = options.context;
    var adminUserTokenRequestDao = daos.createDao('AdminUserTokenRequest', options.context);
    var hideFromDisplay = false;

    if(context.config['admin-token-request-track'] &&
        context.config['admin-token-request-track']['hide-from-display-list']) {

        var listLogins = context.config['admin-token-request-track']['hide-from-display-list'];
        listLogins = listLogins.map(function (login) {
            return login.toLowerCase();
        });

        hideFromDisplay = u.contains(listLogins, options.admin_login.toLowerCase()) === true ? true : false;
    }

    adminUserTokenRequestDao.add({
        admin_user_id: options.admin_user_id,
        user_id: options.user_id,
        source_ip: options.source_ip,
        hide_from_display: hideFromDisplay
    }, callback);
}

/**
 * Check is user disabled. If disabled, callback an 'AccountDisabled' error.
 *
 * @method checkIsUserDisabled
 * @param context {object} request's context object
 * @param userId {Number} user id
 * @param callback {Function} callback function.
 */
function checkIsUserDisabled(context, userId, callback) {
    var userDao = daos.createDao('User', context);
    var user;
    var error;

    async.waterfall([
        function (callback) {
            userDao.getById(userId, function (error, result) {
                if (error) {
                    callback();
                    return;
                }

                user = result;
                callback();
            });
        },

        function (callback) {
            userDao.isUserDisabled(user, callback);
        },

        function (disabled, callback) {
            console.log('is disabled %s', disabled);
            if (disabled) {
                error = new Error("Your account has been disabled.");
                error.statusCode = 401;
                error.errorCode = 'AccountDisabled';
                callback(error);
            } else {
                callback();
            }
        }
    ], callback);
}

/**
 *
 *
 * @method respond
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function retrieveToken(request, response, next) {
    var context = request.context,
        logger = context.logger,
        body = request.body,
        headers = request.headers,
        deviceOS,
        pushNotificationToken;

    logger.info('request body: %j', u.omit(body, 'password'));

    if (body['ios-push-notification-token'] !== undefined) {
        deviceOS = 'ios';
        pushNotificationToken = body['ios-push-notification-token'];
    } else if (body['android-push-notification-token'] !== undefined) {
        deviceOS = 'android';
        pushNotificationToken = body['android-push-notification-token'];
    } else {
        deviceOS = 'unknown';
        pushNotificationToken = '';
    }

    context.input = {
        clientId: headers['x-client-id'],
        deviceId: 'admin-console',
        deviceOS: deviceOS,
        deviceIP: headers['x-device-ip'],
        forwardedForIP: headers['x-forwarded-for'],
        pushNotificationToken: pushNotificationToken,
        description: headers['x-device-info'],
        userId : parseInt(request.params.userId, 10)
    };

    if (!context.input.deviceId) {
        context.input.deviceId = '';
    }

    context.userData = {};

    async.series([
        function (callback) {
            logger.trace('BEGIN: checkParameter');
            checkParameter(context, callback);
        },
        function (callback) {
            logger.trace('BEGIN: getUserInfo');
            getUserInfo(context, callback);
        },
        function (callback) {
            logger.trace('BEGIN: checkIsUserDisabled');
            checkIsUserDisabled(context, context.userData.userId, callback);
        },
        function (callback) {
            logger.trace('BEGIN: getToken');
            getToken(context, callback);
        },
        function (callback) {
            logger.trace('BEGIN: saveToken');
            saveToken(context, callback);
        },
        function (callback) {
            logger.trace('BEGIN: addUserTrack');
            addUserTrack(context, callback);
        },
        function (callback) {
            logger.trace('BEGIN: addAdminUserTokenRequest');
            addAdminUserTokenRequest({
                context: context,
                user_id: context.input.userId,
                admin_login: context.user.login,
                admin_user_id: context.user.userId,
                source_ip: context.remoteAddress
            }, callback);
        }
    ], function (error, result) {
        var returnResult;
        if (error) {
            logger.error("Failed to acquire access token: distributor id(%d)", context.userData.distributorId);
            next(error);
        } else {
            logger.info("Successfully acquired access token: distributor id(%d)", context.userData.distributorId);
            returnResult = {
                statusCode : 200,
                body: {
                    'authentication-token': context.userData.accessToken
                }
            };
            next(returnResult);
        }
    });
}

module.exports = retrieveToken;

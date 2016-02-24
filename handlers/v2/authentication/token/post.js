/**
 * Retrieve authentication token
 */

var async = require('async');
var util = require('util');
var utils = require('../../../../lib/utils');
var daos = require('../../../../daos');
var u = require('underscore');

/**
 * check parameter values from the request
 *
 * @method checkParameter
 * @param context {object} request's context object
 * @param callback {Function} callback function.
 */
function checkParameter(context, callback) {
    var input = context.input,
        logger = context.logger,
        client = context.readDatabaseClient,
        sqlStmt,
        sqlParams,
        error;

    if (input.clientId === undefined) {
        error = new Error('client id is missing');
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (input.user === undefined) {
        error = new Error('user is missing');
        error.statusCode = 400;
        callback(error);
        return;
    }
    if (input.password === undefined) {
        error = new Error('password is missing');
        error.statusCode = 400;
        callback(error);
        return;
    }

    if ((input.deviceOS === 'android' || input.deviceOS === 'ios') && !input.deviceId) {
        error = new Error('device id is missing');
        error.statusCode = 400;
        callback(error);
        return;
    }


    sqlStmt = 'SELECT * FROM mobile.client_ids_secrets WHERE client_id=$1 AND active=true';
    sqlParams = [input.clientId];

    logger.debug('Executing sql query: %s with sqlParams %j', sqlStmt, sqlParams);
    client.query(sqlStmt, sqlParams, function (error, result) {
        if (error) {
            error.statusCode = 500;
            if (process.env.NODE_ENV !== 'production') {
                error['developer-message'] = 'Failed to execute sql query(' + sqlStmt + ')' + ' using parameters [' + sqlParams + ']';
            }
            callback(error);
        } else if (result.rows.length <= 0) {
            error = new Error('Invalid client id or secret');
            error.ignoreAirbrake = true;
            callback(error);
        } else {
            // need to save the secrete here
            callback(null);
        }
    });
}


function getUserValidationDataByDistributorId(context, distributorId, callback) {
    var logger = context.logger,
        distributorDao = daos.createDao('Distributor', context),
        userDao = daos.createDao('User', context),
        userData = context.userData;

    async.waterfall([
        function (callback) {
            distributorDao.getById(distributorId, callback);
        },

        function (distributor, callback) {
            userData.distributorId = distributor.id;

            userDao = daos.createDao('User', context);
            userDao.getById(distributor.user_id, callback);
        },

        function (user, callback) {
            userData.userId = user.id;
            userData.login = user.login;
            userData.passwordSalt = user.password_salt;
            userData.encryptedPassword = user.encrypted_password;

            callback();
        }
    ], callback);
}

function getUserValidationDataByLogin(context, login, callback) {
    var logger = context.logger,
        userDao = daos.createDao('User', context),
        userData = context.userData;

    async.waterfall([
        function (callback) {
            userDao.getUserByLogin(login, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }
				if (!result) {
			        error = new Error("User with login '" + login + "' does not exist.");
			        error.errorCode = 'InvalidLogin';
			        error.statusCode = 400;
			        callback(error);
			        return;
				}
				callback(null, result);
            });
        },

        function (user, callback) {
            userData.userId = user.id;
            userData.login = user.login;
            userData.passwordSalt = user.password_salt;
            userData.encryptedPassword = user.encrypted_password;

            userDao.getDistributorOfUser(user, callback);
        },

        function (distributor, callback) {
            if (distributor) {
                userData.distributorId = distributor.id;
            } else {
                userData.distributorId = 0;
            }

            callback();
        }
    ], callback);
}

/**
 * get the data from user table for verfying the password
 *
 * @method getUserValidationData
 * @param context {object} request's context object
 * @param callback {Function} callback function.
 */
function getUserValidationData(context, callback) {
    var logger = context.logger,
        userDao = daos.createDao('User', context),
        user = context.input.user,
        distributorId;

    if (/^\d+$/.test(user)) {
        distributorId = parseInt(user, 10);
        getUserValidationDataByDistributorId(context, distributorId, callback);
    } else {
        getUserValidationDataByLogin(context, user, callback);
    }
}

/**
 * check the password
 *
 * @method comparePassword
 * @param context {object} request's context object
 * @param callback {Function} callback function.
 */
function comparePassword(password, passwordSalt, encryptedPassword, callback) {
    var error;

    if (utils.checkPassword(password, passwordSalt, encryptedPassword) === false) {
        error = new Error("We didn't recognize your ID and password.");
        error.statusCode = 401;
        callback(error);
    } else {
        callback(null, true);
    }
}


/**
 * get base64 encoded access token
 *
 * @method getToken
 * @param context {object} request's context object
 * @param callback {Function} callback function.
 */
function getToken(context, callback) {
    var hmacContent,
        input = context.input,
        userData = context.userData,
        logger = context.logger,
        currentTime = new Date().getTime(),
        rawData = [
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
    var currentTime = new Date(),
        client = context.databaseClient,
        logger = context.logger,
        input = context.input,
        userData = context.userData;

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


function addUserTrack(context, callback) {
    var userTrackDao = daos.createDao('UserTrack', context),
        input = context.input,
        userData = context.userData,
        userTrack = {
            userId : userData.userId,
            signInAt : new Date(),
            signInIP : input.forwardedForIP,
        };

    userTrackDao.addUserTrack(userTrack, function (error) {
        callback(error);
    });
}

function callbackAccountDisabledError(callback) {
    var error = new Error("Your account has been disabled.");
    error.statusCode = 401;
    error.errorCode = 'AccountDisabled';
    callback(error);
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
    var userDao = daos.createDao('User', context),
        user,
        error;

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
            if (disabled) {
                callbackAccountDisabledError(callback);
            } else {
                callback();
            }
        },

        function (callback) {
            userDao.getRolesOfUser(user, callback);
        },

        function (roles, callback) {
            if (roles.length === 0) {
                callbackAccountDisabledError(callback);
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
        clientId: body['client-id'],
        deviceId: headers['x-device-uuid'],
        deviceOS: deviceOS,
        deviceIP: headers['x-device-ip'],
        forwardedForIP: headers['x-forwarded-for'],
        pushNotificationToken: pushNotificationToken,
        user: body.user,
        password: body.password,
        description: headers['x-device-info']
    };

    if (!context.input.deviceId) {
        context.input.deviceId = '';
    }

    if (context.input.user) {
        context.input.user = context.input.user.toString().toLowerCase();
    }

    context.userData = {};

    async.series([
        function (callback) {
            logger.trace('BEGIN: checkParameter');
            checkParameter(context, callback);
        },
        function (callback) {
            logger.trace('BEGIN: getUserValidationData');
            getUserValidationData(context, callback);
        },
        function (callback) {
            logger.trace('BEGIN: comparePassword');
            comparePassword(context.input.password,
                            context.userData.passwordSalt,
                            context.userData.encryptedPassword,
                            callback);
        },
        function (callback) {
            logger.trace('BEGIN: checkIsUserDisabled');
            checkIsUserDisabled(context,
                            context.userData.userId,
                            callback);
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

exports.retrieveToken = retrieveToken;

var async = require('async'),
    utils = require('../lib/utils'),
    daos = require('../daos'),
    TOKEN_HEADER_NAME = 'X-Authentication-Token';

/**
 * parse access token and set up distributor id, device id, timestamp, and signature
 *
 * @method parseAccessToken
 * @param request {Request} express request object.
 * @param callback {Function} async callback function.
 */
function parseAccessToken(request, callback) {
    var context = request.context,
        logger = request.context.logger,
        encodedAccessToken,
        rawAccessTokenArray,
        error;

    encodedAccessToken = request.get(TOKEN_HEADER_NAME);

    if (!encodedAccessToken || typeof encodedAccessToken !== 'string') {
        error = new Error(
            'No ' + TOKEN_HEADER_NAME + ' is found in the request header.'
        );
        error.statusCode = 401;
        callback(error);
        return;
    }

    logger.trace('Parsing %s: %s', TOKEN_HEADER_NAME, encodedAccessToken);

    rawAccessTokenArray = utils.getRawAccessTokenArray(encodedAccessToken);

    if (rawAccessTokenArray.length === 0) {
        error = new Error(
            'Invalid ' + TOKEN_HEADER_NAME + ': ' + encodedAccessToken
        );
        error.statusCode = 401;
        callback(error);
        return;
    }

    if (rawAccessTokenArray.length === 5) {
        // token v1
        context.user = {
            distributorId: parseInt(rawAccessTokenArray[0], 10),
            userId: parseInt(rawAccessTokenArray[1], 10),
            deviceId: rawAccessTokenArray[2],
            tokenTimestamp: rawAccessTokenArray[3],
            tokenSignature: rawAccessTokenArray[4],
            tokenVersion: 1
        };
    } else {
        context.user = {
            distributorId: parseInt(rawAccessTokenArray[0], 10),
            userId: parseInt(rawAccessTokenArray[1], 10),
            login: rawAccessTokenArray[2],
            deviceId: rawAccessTokenArray[3],
            tokenTimestamp: rawAccessTokenArray[4],
            clientId: rawAccessTokenArray[5],
            tokenSignature: rawAccessTokenArray[6],
            tokenVersion: 2
        };
    }

    logger.debug('Parsed %s: %j', TOKEN_HEADER_NAME, context.user);

    callback(null);
}

/**
 * Load user's hmac key from database.
 *
 * @method loadHmacKey
 * @param request {Request} express request object.
 * @param callback {Function} async callback function.
 */
function loadHmacKey(request, callback) {
    var context = request.context,
        logger = context.logger,
        client = context.databaseClient,
        noResultError,
        sqlStmt,
        sqlParams;

    sqlStmt = "SELECT hmac_key FROM mobile.oauth_tokens WHERE distributor_id=$1 AND client_id=$2 AND device_id=$3 AND active=true ORDER BY id DESC limit 1";
    sqlParams = [context.user.distributorId, context.user.clientId, context.user.deviceId];

    logger.debug('Executing sql query: %s with values %j', sqlStmt, sqlParams);

    client.query(sqlStmt, sqlParams, function (error, result) {
        if (error) {
            error.statusCode = 500;
            callback(error);
        } else if (result.rows.length <= 0) {
            noResultError = new Error("Invalid access token");
            noResultError.statusCode = 401;
            callback(noResultError);
        } else {
            context.user.hmacKey = result.rows[0].hmac_key;
            callback(null);
        }
    });
}

/**
 * Validate access token's using signature
 *
 * @method validateAccessToken
 * @param request {Request} express request object.
 * @param callback {Function} async callback function.
 */
function validateAccessToken(request, callback) {
    var context = request.context,
        logger = request.context.logger,
        rawData,
        signature,
        error;

    if (context.user.tokenVersion === 1) {
        rawData = [
            context.user.distributorId,
            context.user.userId,
            context.user.deviceId,
            context.user.tokenTimestamp
        ].join('::');
    } else {
        rawData = [
            context.user.distributorId,
            context.user.userId,
            context.user.login,
            context.user.deviceId,
            context.user.tokenTimestamp,
            request.get('x-client-id')
        ].join('::');
    }

    signature = utils.getHamcContent(context.user.hmacKey, rawData);

    logger.debug(
        'Comparing expected signature %s with given signature %s',
        signature,
        context.user.tokenSignature
    );

    if (signature !== context.user.tokenSignature) {
        error = new Error(
            'Invalid access token signature.'
        );
        error.statusCode = 401;
        callback(error);
        return;
    }

    context.logger = logger.child({
        'distributor-id' : context.user && context.user.distributorId
    }, true);

    callback(null);
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
                    if (error.errorCode === 'UserNotFound') {
                        error = new Error("Your account was not found.");
                        error.statusCode = 401;
                        error.errorCode = 'InvalidAccessToken';
                    }

                    callback(error);
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
 * Check the X-Authentication-Token to make sure it's valid and store
 * the authenticated user information in the context.
 *
 * Required:
 * request.context.config
 * request.context.logger
 * request.context.databaseClient
 *
 * Output:
 * request.context.user =
 *
 * @method databaseConnector
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function authenticator(request, response, next) {
    var context = request.context,
        logger = request.context.logger;

    logger.debug('Authenticating X-Authentication-Token.');

    async.series([
        function (callback) {
            parseAccessToken(request, callback);
        },
        function (callback) {
            checkIsUserDisabled(context, context.user.userId, callback);
        },
        function (callback) {
            loadHmacKey(request, callback);
        },
        function (callback) {
            validateAccessToken(request, callback);
        }
    ], function (error) {
        if (error) {
            context.user = null;
            next(error);
            return;
        }

        logger.debug('Successfully authenticated access token');

        next(null);
    });
}

module.exports = authenticator;

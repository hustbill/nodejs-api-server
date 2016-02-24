var async = require('async');
var daos = require('../daos');


function checkClientIdAndClientSecret(context, clientId, clientSecret, callback) {
    var logger = context.logger;

    logger.debug('check client id and client secret');
    context.readModels.ClientIdSecret.find({
        where : {client_id : clientId}
    }).done(function (error, client) {
        if (error) {
            callback(error);
            return;
        }

        if (!client) {
            error = new Error('Invalid client id');
            error.errorCode = 'InvalidClientId';
            error.statusCode = 400;
            callback(error);
            return;
        }

        if (client.client_secret !== clientSecret) {
            error = new Error("Client id and client secret not match.");
            error.statusCode = 400;
            callback(error);
            return;
        }

        callback();
    });
}


function checkPermission(context, clientId, apiName, callback) {
    var logger = context.logger,
        clientApiPermissionDao = daos.createDao('ClientApiPermission', context);

    clientApiPermissionDao.hasPermission(clientId, apiName, function (error, hasPermission) {
        if (error) {
            callback(error);
            return;
        }

        if (!hasPermission) {
            error = new Error("You have no permission to call this api.");
            error.statusCode = 403;
            callback(error);
            return;
        }

        callback();
    });
}


function validator(apiName) {
    return function (req, res, next) {
        var context = req.context,
            logger = context.logger,
            clientId = req.get('x-client-id'),
            clientSecret = req.get('x-client-secret'),
            redisClient = context.redisClient,
            cacheKey = 'client_api_permission_' + clientId + '_' + apiName,
            cacheTTL = 60;

        async.waterfall([
            function (callback) {
                // check input
                var error;
                if (!clientId) {
                    error = new Error('client id is missing');
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                if (!clientSecret) {
                    error = new Error('client secret is missing');
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            },

            function (callback) {
                // check cache
                if (!redisClient) {
                    callback();
                    return;
                }

                redisClient.get(cacheKey, function (error, result) {
                    if (error) {
                        context.logger.warn(
                            'Failed to read key: %s from redis: %s',
                            cacheKey,
                            error.message || error
                        );

                        callback();
                        return;
                    }

                    if (!result) {
                        callback();
                        return;
                    }

                    result = JSON.parse(result);

                    if (result.clientSecret !== clientSecret) {
                        error = new Error("Client id and client secret not match.");
                        error.statusCode = 400;
                        next(error);
                        return;
                    }

                    if (!result.allowed) {
                        error = new Error("You have no permission to call this api.");
                        error.statusCode = 403;
                        next(error);
                        return;
                    }

                    next();
                });

            },

            function (callback) {
                checkClientIdAndClientSecret(context, clientId, clientSecret, callback);
            },

            function (callback) {
                checkPermission(context, clientId, apiName, callback);
            }

        ], function (error) {
            if (error) {
                logger.debug('api permission validated fail: %s', error.message);
                next(error);
                return;
            }

            logger.debug('api permission validated ok.');

            if (redisClient) {
                redisClient.set(
                    cacheKey,
                    JSON.stringify({
                        clientSecret : clientSecret,
                        allowed : true
                    }),
                    function (error) {
                        if (error) {
                            context.logger.warn(
                                'Failed to store data into redis: %s',
                                cacheKey,
                                error.message || error
                            );
                        }
                    }
                );
                redisClient.expire(cacheKey, cacheTTL);
            }

            next();
        });
    };
}

module.exports = validator;

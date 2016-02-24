/**
 * Run autoship.
 * This script will call run autoship api to create autoship orders.
 */
var program = require('commander');
var async = require('async');
var fs = require('fs');
var moment = require('moment');
var path = require('path');
var bunyan = require('bunyan');

// Constants
var CONFIG_LOCATION = './run-autoship.config.json';
var MIDDLEWARE_LOCATION = './middleware';
var HANDLERS_LOCATION = './handlers';
var MODELS_LOCATION = './models';

var middleware = require(MIDDLEWARE_LOCATION);
var DAO = require('./daos/DAO');
var daos = require('./daos/index');
var utils = require('./lib/utils');
var request = require('request');

var config,
    configFileLocation,
    logger;

function applyMiddleware(context, handler, callback) {
    var request = {
            context : context
        },
        response = {
        };

    handler(request, response, function (result) {
        if (result instanceof Error) {
            callback(result);
        } else {
            callback();
        }
    });
}
function getContext(options, callback) {
    var context = {};

    context.remoteAddress = '127.0.0.1';
    context.config = options.config;
    context.logger = options.logger;

    async.waterfall([
        function (callback) {
            applyMiddleware(context, middleware.memcachedConnector, callback);
        },

        function (callback) {
            applyMiddleware(context, middleware.databaseConnector(), callback);
        },

        function (callback) {
            applyMiddleware(context, middleware.databaseConnector('read'), callback);
        },

        function (callback) {
            var handler = middleware.sequelizer(
                    path.join(__dirname, MODELS_LOCATION),
                    context.config,
                    context.logger
                );
            applyMiddleware(context, handler, callback);
        },

        function (callback) {
            callback(null, context);
        }
    ], callback);
}

function saveToken(context, hmacKey, clientId, deviceId, callback) {
    var currentTime = new Date(),
        distributorId = 0,
        deviceOS = '',
        pushNotificationToken = '',
        description = '';

    async.parallel({
        insert_1: function (inner_callback) {
            var description = "oauth token",
                sqlStmt = 'SELECT mobile.save_oauth_token($1, $2, $3, $4, $5, true)',
                sqlParams = [
                    hmacKey,
                    distributorId,
                    clientId,
                    deviceId,
                    description
                ];

            utils.dbQueryWriteDatabase(context, sqlStmt, sqlParams, inner_callback);
        },
        insert_2: function (inner_callback) {
            var description = (description === undefined) ? "device info" : description,
                sqlStmt = 'SELECT mobile.save_device($1, $2, $3, $4, $5, true)',
                sqlParams = [
                    distributorId,
                    deviceId,
                    deviceOS,
                    pushNotificationToken,
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


function getAdminAuthenticationToken(context, callback) {
    var logger = context.logger,
        config = context.config.autoshipOrderGenerator,
        adminUserLogin = config.adminUserLogin,
        user,
        distributor,
        hmacKey,
        accessToken,
        error;

    if (!adminUserLogin) {
        error = new Error("'adminUserLogin' is not set. please set it in config file.");
        callback(error);
        return;
    }

    logger.info("Getting authentication token of admin '%s'", adminUserLogin);
    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getUserByLogin(adminUserLogin, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                user = result;
                if (!user) {
                    error = new Error("admin with login '" + adminUserLogin + "' dose not exist.");
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            var currentTime = new Date().getTime(),
                deviceId = 'autoship-order-generator',
                rawData = [
                    0,
                    user.id,
                    user.login,
                    deviceId,
                    currentTime,
                    config.apiClientId
                ].join('::');

            try {
                hmacKey = require('crypto').randomBytes(16).toString('base64');
                accessToken = utils.getAccessToken(hmacKey, rawData);
                logger.debug("access token: %s", accessToken);

                saveToken(context, hmacKey, config.apiClientId, deviceId, function (error) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    callback(null, accessToken);
                });
            } catch (ex) {
                callback(ex);
            }
        }
    ], callback);
}

function sendRunAutoshipRequest(context, token, autoshipDate, callback) {
    var config = context.config.autoshipOrderGenerator,
        url = config.apiServerAddress + "/v2/admin/autoship-runs",
        requestOptions = {
            method : 'POST',
            headers : {
                Accept : 'application/json',
                'Accept-Language' : 'en-US',
                'Content-Type' : 'application/json',
                'User-Agent' : 'mobile-pulse/2.0.0',
                'X-Client-Id' : config.apiClientId,
                'X-Authentication-Token' : token
            },
            url : url,
            timeout : 3000000,
            json : {
                "autoship-date" : autoshipDate
            }
        };

    logger.debug('Sending run autoship request to api: %s', url);
    request(requestOptions, function (error, response, body) {
        if (error) {
            callback(error);
            return;
        }

        logger.debug('Response data: %j', body);
        callback(null, body);
    });

}

function generateAutoshipOrders(context, autoshipDate, callback) {
    var logger = context.logger,
        token,
        results = [];

    logger.info("Start generating autoship orders...");
    async.waterfall([
        function (callback) {
            getAdminAuthenticationToken(context, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                token = result;
                callback();
            });
        },

        function (callback) {
            sendRunAutoshipRequest(context, token, autoshipDate, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                var responseError = result.meta && result.meta.error;
                if (responseError) {
                    error = new Error(responseError.message);
                    error.errorCode = responseError['error-code'];
                    callback(error);
                    return;
                }

                callback(null, result.response);
            });
        }
    ], callback);
}


try {
    program
        .version('0.0.1')
        .option('--config-file <configFile>', "Pathname of the config file. '" + CONFIG_LOCATION + "' as default.")
        .option('--autoship-date <autoshipDate>', 'Date of the autoships should be run. Today as default.')
        .parse(process.argv);

    // Load configuration, one time operation, so it's okay to be synchronise.
    /*jslint nomen:true*/
    configFileLocation = program.configFile || path.join(__dirname, CONFIG_LOCATION);
    config = JSON.parse(fs.readFileSync(configFileLocation));

    // Create master process logger
    logger = bunyan.createLogger({
        name : config.name,
        level : config.log.level,
        pid : process.pid,
        master : true
    });

    // Redirect console.log and console.error
    console.error = logger.warn.bind(logger);
    console.log = logger.info.bind(logger);

    async.waterfall([
        function (callback) {
            var getContextOptions = {
                    config : config,
                    logger : logger
                };
            getContext(getContextOptions, callback)
        },

        function (context, callback) {
            if (!program.autoshipDate) {
                program.autoshipDate = moment().format('YYYY-MM-DD');
            }
            generateAutoshipOrders(context, program.autoshipDate, callback);
        }
    ], function (error, results) {
        if (error) {
            logger.error("Generate autoship orders failed: %s", error.message);
            process.exit(1);
            return;
        }

        logger.info("Generate autoship orders finished.");
        logger.info(results);
        process.exit(0);
    });

} catch (error) {
    (logger || console).error('Failed to start the server: %s', error.stack);
}

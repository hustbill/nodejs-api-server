/**
 * Run Reminder Job.
 * 
 */
var program = require('commander');
var async = require('async');
var fs = require('fs');
var moment = require('moment');
var path = require('path');
var bunyan = require('bunyan');
var u = require('underscore');
var request = require('request');

// Constants
var CONFIG_LOCATION = './run-reminder-job.config.json';
var MIDDLEWARE_LOCATION = '../middleware';
var HANDLERS_LOCATION = '../handlers';
var MODELS_LOCATION = '../models';

var middleware = require(MIDDLEWARE_LOCATION);
var DAO = require('../daos/DAO');
var daos = require('../daos/index');
var utils = require('../lib/utils');


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
        config = context.config.reminderJob,
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
                deviceId = 'reminder-job',
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


function fetchInactiveList(context, token, callback) {
    var config = context.config.reminderJob,
        url = config.apiServerAddress + "/v2/admin/commissions/inactive-users",
        requestOptions = {
            method : 'GET',
            headers : {
                Accept : 'application/json',
                'Accept-Language' : 'en-US',
                'Content-Type' : 'application/json',
                'User-Agent' : 'reminder-job/2.0.0',
                'X-Client-Id' : config.apiClientId,
                'X-Company-Code': config.companyCode,
                'X-Authentication-Token' : token
            },
            url : url,
            timeout : 3000000
        };

    logger.debug('Sending run autoship request to api: %s', url);
    request(requestOptions, function (error, response, body) {
        if (error) {
            callback(error);
            return;
        }
        body = JSON.parse(body);
        // logger.debug('Response data: %j', body);
        callback(null, body);
    });

}

function parserInactiveList(context,templateIndex, result, callback){
    var logger = context.logger;
    // {:101108,
           //  "sponsor-id":101011,
           //  "sponsor-name":"Deborah Bouziden",
           //  "name":"Yvette Wilson",
           //  "email":"victor.zhang@2vive.com",
           //  "rolling-three-month-pv":0,
           //  "active-until-date":"2014-10-31"}
            // logger.debug("item:%j",result[0]);
            var count = {succeeded:0, skiped:0};

            if(!u.isArray(result) || u.isEmpty(result)){
                logger.info('result is empty');
                return (callback());
            }
            // result = [result[0]];

            async.eachSeries(result, function(item, callback2) {

                if(u.isString(item.email) && item.email.length > 0 
                    && moment(item["active-until-date"]).format("YYYY-MM") === moment().format("YYYY-MM")){
                    // logger.debug("item:%j", item);
                    var options = {
                        context: context,
                        mailData:{
                            "email-subject":  "Maintain your Become Beauty Advisor Activation",
                            "recipient-email":  item.email,
                            "distributor-id":item["distributor-id"],
                            "temp-idx":templateIndex,
                            "distributor-name":item.name,
                            "rolling-three-month-pv": item["rolling-three-month-pv"],
                            "active-until-date":item["active-until-date"]
                            }
                    };
                    logger.info('SEND inactive item:%j', item);
                    sendReminderInactiveEmail(options, function(){
                        count.succeeded ++;
                        callback2();
                    });
                    

                }else{
                    logger.info('SKIP inactive item:%j', item);
                    count.skiped ++;
                    callback2();
                }
            }, function(err) {
                logger.info("inactive result count:%j", count);
                callback();
            });
}



function fetchReactivationList(context, token, callback) {
    var config = context.config.reminderJob,
        url = config.apiServerAddress + "/v2/commissions/next-month-cancelled-users",
        requestOptions = {
            method : 'GET',
            headers : {
                Accept : 'application/json',
                'Accept-Language' : 'en-US',
                'Content-Type' : 'application/json',
                'User-Agent' : 'reminder-job/2.0.0',
                'X-Client-Id' : config.apiClientId,
                'X-Company-Code': config.companyCode,
                'X-Authentication-Token' : token
            },
            url : url,
            timeout : 3000000
        };

    logger.debug('Sending run autoship request to api: %s', url);
    request(requestOptions, function (error, response, body) {
        if (error) {
            callback(error);
            return;
        }
        body = JSON.parse(body);
        // logger.debug('Response data: %j', body);
        callback(null, body);
    });

}

function parserReactivationList(context, result, callback){
    var logger = context.logger;
    // {:101108,
           //  "sponsor-id":101011,
           //  "sponsor-name":"Deborah Bouziden",
           //  "name":"Yvette Wilson",
           //  "email":"victor.zhang@2vive.com",
           //  "rolling-three-month-pv":0,
           //  "active-until-date":"2014-10-31"}
            // logger.debug("item:%j",result[0]);
            var count = {succeeded:0, skiped:0};

            if(!u.isArray(result) || u.isEmpty(result)){
                logger.info('result is empty');
                return (callback());
            }
            // result = [result[0]];

            async.eachSeries(result, function(item, callback2) {

                if(u.isString(item.email) && item.email.length > 0 ){
                    // logger.debug("item:%j", item);
                    var options = {
                        context: context,
                        mailData:{
                            "email-subject":  "Reactivation Monthly Reminder",
                            "recipient-email":  item.email,
                            "distributor-id":item["distributor-id"],
                            "distributor-name":item.name,
                            "rolling-three-month-pv": item["rolling-three-month-pv"],
                            "active-until-date":item["active-until-date"]
                            }
                    };
                    logger.info('SEND reactivation item:%j', item);
                    sendReminderReactivationEmail(options, function(){
                        count.succeeded ++;
                        callback2();
                    });
                    

                }else{
                    logger.info('SKIP reactivation item:%j', item);
                    count.skiped ++;
                    callback2();
                }
            }, function(err) {
                logger.info("reactivation result count:%j", count);
                callback();
            });
}


function prepareRequestOptions(context, mailType, mailData) {
    var mailServiceConfig = context.config.mailService,
        url = mailServiceConfig.serverAddress + "/emails/" + mailType,
        clientId = mailServiceConfig.clientId,
        timeout = mailServiceConfig.timeout,
        requestOptions;

    requestOptions = {
        method : 'POST',
        headers : {
            Accept : 'application/json',
            'Accept-Language' : 'en-US',
            'Content-Type' : 'application/json',
            'User-Agent' : 'mobile-pulse/2.0.0',
            'X-Client-Id' : clientId,
            'X-Company-Code' : mailServiceConfig.companyCode,
        },
        url : url,
        timeout : timeout,
        json : mailData
    };

    return requestOptions;
}

function sendMail(context, mailType, mailData, callback) {
    var logger = context.logger,
        requestOptions = prepareRequestOptions(context, mailType, mailData);

    logger.debug("Sending mail of type %s with data %j", mailType, mailData);
    request(requestOptions, function (error, response, body) {
        if (error) {
            logger.error(
                "Error when sending mail of type %s: %s",
                mailType,
                (error && error.message)
            );
        }
        if (callback) {
            callback();
        }
    });

    
}

function sendReminderInactiveEmail(options, callback){
    var context = options.context,
        logger = context.logger,
        config = context.config || {},
        application = config.application || {};

        var mailData = options.mailData;


        logger.debug("reminder/inactive:%j", mailData);

        sendMail(context, 'reminder/inactive', mailData, function (error) {
            if (error) {
                logger.error("Failed to send resetting password: %s from:%s", error.message, email);
            }
            logger.info("send inactive email....");
            callback(null);
        });
}

function sendReminderReactivationEmail(options, callback){
    var context = options.context,
        logger = context.logger,
        config = context.config || {},
        application = config.application || {};

        var mailData = options.mailData;


        logger.debug("reminder/reactivation:%j", mailData);

        sendMail(context, 'reminder/reactivation', mailData, function (error) {
            if (error) {
                logger.error("Failed to send resetting password: %s from:%s", error.message, email);
            }
            logger.info("send reactivation email....");
            callback(null);
        });
}


function runReminderJob(context, templateIndex, callback) {
    var logger = context.logger,
        token,
        results = [];

    logger.info("Start reminder job ...");
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

        //
        function(callback) {
            fetchInactiveList(context, token, function(error, result){
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
                var responseData = u.isArray(result.response) ? result.response : result.response.body;
                callback(null, responseData);

            });
        },

        function (result, callback) {
           parserInactiveList(context, templateIndex, result, function(){
                callback();
           });

        },

        //
        function(callback) {
            fetchReactivationList(context, token, function(error, result){
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
        },

        function (result, callback) {
           parserReactivationList(context, result, function(){
                callback();
           });

        }

    ], callback);
}


try {
    program
        .version('0.0.1')
        .option('--config-file <configFile>', "Pathname of the config file. '" + CONFIG_LOCATION + "' as default.")
        .option('--template-index <index>', 'The index of tempate for reminder should be run. 1 as default.')
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
            getContext(getContextOptions, callback);
        },

        function (context, callback) {
            if (!program.templateIndex) {
                program.templateIndex = 1;
            }
            runReminderJob(context, program.templateIndex, callback);
        }
    ], function (error, results) {
        if (error) {
            logger.error("Run reminder job failed: %s", error.message);
            process.exit(1);
            return;
        }

        logger.info("Reminder job finished.");
        logger.info(results);
        process.exit(0);
    });

} catch (error) {
    (logger || console).error('Failed to start the server: %s', error.stack);
}

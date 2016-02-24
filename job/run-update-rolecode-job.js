/**
 * Run Cancelled User Job.
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

var now = new Date(); // 2014-11-02

function pre_month_first_day(date){
    return moment(date).add(-1, 'months').date(1).format("YYYY-MM-DD");
}

function pre_2month_last_day(date){
    return moment(date).add(-1, 'months').date(0).format("YYYY-MM-DD");
}

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

function sendReminderCancelEmail(options, callback){
    var context = options.context,
        logger = context.logger,
        config = context.config || {},
        application = config.application || {};

        var mailData = options.mailData;


        logger.debug("reminder/cancel:%j", mailData);

        sendMail(context, 'reminder/cancel', mailData, function (error) {
            if (error) {
                logger.error("Failed to send resetting password: %s from:%s", error.message, email);
            }
            logger.info("send cancel email....");
            callback(null);
        });
}


function fetchCancelledUserList(context, token, callback) {
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
            url : url + "?date="+pre_month_first_day(now),
            timeout : 3000000
        };

    logger.debug('Sending request to api: %s', url);
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


function cancelledUser(context, token, userId, postData, callback) {
    var config = context.config.reminderJob,
        url = config.apiServerAddress + "/v2/admin/users/"+userId+"/roles",
        requestOptions = {
            method : 'POST',
            headers : {
                Accept : 'application/json',
                'Accept-Language' : 'en-US',
                'Content-Type' : 'application/json',
                'User-Agent' : 'cancelled-user-job/2.0.0',
                'X-Client-Id' : config.apiClientId,
                'X-Company-Code': config.companyCode,
                'X-Authentication-Token' : token
            },
            url : url,
            timeout : 3000000,
            json : postData
        };

    logger.debug('Sending request to api: %s', url);
    request(requestOptions, function (error, response, body) {
        if (error) {
            callback(error);
            return;
        }
        // body = JSON.parse(body);
        // logger.debug('Response: %j', response);
        // logger.debug('Response body: %j', body);
        callback(null, response);
    });

}

function parserCancelledUserList(context, token, result, callback){
    var logger = context.logger;
    // {"distributor-id":101513,
    // "sponsor-id":100104,
    // "sponsor-name":"Jennifer Goodrich",
    // "name":"Colleen Forquer",
    // "email":"victor.zhang@2vive.com",
    // "rolling-three-month-pv":0,
    // "active-until-date":"2014-10-31",
    // "role-code":"D",
    // "user-id":1515}
            // logger.debug("item:%j",result[0]);
            var count = {succeeded:0, failed:0, error:0, skiped:0};

            if(!u.isArray(result) || u.isEmpty(result)){
                logger.info('result is empty');
                return (callback());
            }

             logger.debug("result.length:%d",result.length);
            // result = [result[1]];

            async.eachSeries(result, function(item, callback2) {

                
                    // logger.debug("item:%j", item);
                if(item['role-code'] === 'D' && item['active-until-date'] === pre_2month_last_day(now)){
                    var userId = item['user-id'];
                    var postData = {
                            "role-code" : "R",
                            "move-downline-to-sponsor" : true,
                            "notes" : "change role from advisor to retail customer"
                        };
                    logger.info('SEND  item:%j', item);
                    cancelledUser(context, token, userId, postData, function(error, response){
                        if(error){
                            count.error ++;
                            logger.info('error  item:%j', item);
                        }else if(response && response.statusCode === 200){
                            count.succeeded ++;
                            logger.info('succeeded  item:%j', item);

                            var mailOptions = {
                                context: context,
                                mailData:{
                                    "email-subject":  "Sorry to see you go..",
                                    "recipient-email":  item.email,
                                    "distributor-id":item["distributor-id"],
                                    "distributor-name":item.name,
                                    "sponsor-id": item["sponsor-id"],
                                    "sponsor-name": item["sponsor-name"],
                                    "active-until-date":item["active-until-date"]
                                    }
                            };
                            sendReminderCancelEmail(mailOptions, function(){
                                
                            });
                        }else{
                            count.failed ++; 
                            logger.info('failed  item:%j', item);
                        }
                        callback2();
                    });
                }else{
                    logger.info('SKIP  item:%j', item);
                    count.skiped ++;
                    callback2();
                }   
            }, function(err) {
                logger.info(" result count:%j", count);
                callback();
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
            fetchCancelledUserList(context, token, function(error, result){
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
           parserCancelledUserList(context, token, result, function(){
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

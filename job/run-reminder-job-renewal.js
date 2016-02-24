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


function fetchRenewalList(context, token, callback) {
    var config = context.config.reminderJob,
        logger = context.logger,
        curr_date, 
        sqlStmt,
        queryDatabaseOptions;

        sqlStmt = " SELECT d.id, u.email, add.firstname || ' ' || add.lastname AS name, d.next_renewal_date ";
        sqlStmt += " FROM distributors d ";
        sqlStmt += " INNER JOIN users u ON u.id = d.user_id  ";
        sqlStmt += " INNER JOIN users_home_addresses uha ON uha.user_id = d.user_id AND uha.is_default = true AND uha.active = true ";
        sqlStmt += " INNER JOIN addresses add ON add.id = uha.address_id ";
        sqlStmt += " WHERE date_trunc('day',next_renewal_date) = to_date($1, 'YYYY-MM-DD') + '5 day'::interval ";
        
        curr_date = moment().format("YYYY-MM-DD");
        

        queryDatabaseOptions = {
            sqlStmt: sqlStmt,
            sqlParams: [curr_date]
        };


        DAO.queryDatabase(context, queryDatabaseOptions, function(error, result){
            if(error){
                logger.error("db error:%j", error);
                return callback(error);
            }
            logger.info("result:%j", result);

            if(!result || !result.rows){
                return callback(null, []);
            }

            callback(null, result.rows);


        });


}

function parserRenewalList(context, result, callback){
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
                    logger.debug("item:%j", item);
                    var options = {
                        context: context,
                        mailData:{
                            "email-subject":  "Renewal Reminder",
                            "recipient-email": item.email,
                            "distributor-id": item.id,
                            "distributor-name": item.name,
                            "next-renewal-date":item.next_renewal_date
                            }
                    };
                    logger.info('SEND renewal item:%j', item);
                    sendReminderRenewalEmail(options, function(){
                        count.succeeded ++;
                        callback2();
                    });
                    

                }else{
                    logger.info('SKIP renewal item:%j', item);
                    count.skiped ++;
                    callback2();
                }
            }, function(err) {
                logger.info("renewal result count:%j", count);
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

function sendReminderRenewalEmail(options, callback){
    var context = options.context,
        logger = context.logger,
        config = context.config || {},
        application = config.application || {};

        var mailData = options.mailData;

        sendMail(context, 'reminder/renewal', mailData, function (error) {
            if (error) {
                logger.error("Failed to send resetting password: %s from:%s", error.message, email);
            }
            logger.info("send reactivation email....");
            callback(null);
        });
}


function runReminderJob(context, callback) {
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
            fetchRenewalList(context, token, function(error, result){
                if (error) {
                    callback(error);
                    return;
                }
                
                callback(null, result);

            });
        },

        function (result, callback) {
           parserRenewalList(context, result, function(){
                callback();
           });

        }

    ], callback);
}


try {
    program
        .version('0.0.1')
        .option('--config-file <configFile>', "Pathname of the config file. '" + CONFIG_LOCATION + "' as default.")
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

            runReminderJob(context, callback);
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

/*jslint nomen: true */

var async = require('async');
var fs = require('fs');
var path = require('path');

var CONFIG_LOCATION = '../config.json.test';
var MIDDLEWARE_LOCATION = '../middleware';
var MODELS_LOCATION = '../models';

var middleware = require(MIDDLEWARE_LOCATION);

function getConsoleLogger() {
    var consoleLogTarget = function () {
        console.log.apply(console, arguments);
    };

    return {
        trace : consoleLogTarget,
        debug : consoleLogTarget,
        info : consoleLogTarget,
        warn : consoleLogTarget,
        error : consoleLogTarget
    };
}

function getEmptyLogger() {
    var emptyLogTarget = function () {
    };

    return {
        trace : emptyLogTarget,
        debug : emptyLogTarget,
        info : emptyLogTarget,
        warn : emptyLogTarget,
        error : emptyLogTarget
    };
}

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


function getDatabaseClient(callback) {
    var context = {};
    context.config = JSON.parse(fs.readFileSync(path.join(__dirname, CONFIG_LOCATION)));
    applyMiddleware(context, middleware.databaseConnector(), function (error) {
        if (error) {
            callback(error);
            return;
        }
        callback(null, context.databaseClient);
    });
}


function getDatabaseModels(callback) {
    var context = {};
    context.config = JSON.parse(fs.readFileSync(path.join(__dirname, CONFIG_LOCATION)));
    applyMiddleware(context, middleware.databaseConnector(), function (error) {
        if (error) {
            callback(error);
            return;
        }
        callback(null, context.databaseClient);
    });
}


function getTestUserId() {
    return 13455;
}


function getTestDistributorId() {
    return 246201;
}


function getTestUserIdOfCA() {
    return 13396;
}


function getTestDistributorIdOfCA() {
    return 1000101;
}


function getTestLoginName() {
    return 'mseevers';
}


function getTestLoginNameOfCA() {
    return 'master';
}


function getTestAddressIdOfUnitedStates() {
    return 1013;
}


function getTestAddressData() {
    return {
        firstname : 'Mike',
        lastname : 'Jim',
        address1 : '111 Autumn Drive',
        address2 : '',
        city : 'LANCASTER',
        country_id : 1214,
        country : {
            id : 1214,
            name : 'United States',
            iso : 'US',
            iso3 : 'USA'
        },
        state_id : 10049,
        state : {
            id : 10049,
            name : 'Ohio',
            abbr : 'OH',
            country_id : 1214
        },
        zipcode : '43130',
        phone : '13312345678'
    };
}


function getTestOrderIdOfNormal() {
    return 5775046;
}


function getTestOrderIdOfOthers() {
    return 5899282;
}


function getValidVisaCreditcardNumber() {
    return '4111111111111111';
}


function getInvalidCreditcardNumber() {
    return '3400009999999991';
}


function getTestCreditcardInfoOfNormal() {
    return {
        number : getValidVisaCreditcardNumber(),
        year : '2123',
        month : '12',
        first_name : 'foo',
        last_name : 'bar',
        cvv : '123'
    };
}


function getTestCreditcardInfoWithInvalidCreditcard() {
    return {
        number : getInvalidCreditcardNumber(),
        expiration_year : '2123',
        expiration_month : '12',
        first_name : 'foo',
        last_name : 'bar',
        cvv : '123'
    };
}


function getContext(options, callback) {
    var context = {};

    if (!options) {
        options = {};
    }

    context.remoteAddress = '127.0.0.1';
    context.config = JSON.parse(fs.readFileSync(path.join(__dirname, CONFIG_LOCATION)));
    context.companyCode = 'TEST';

    if (options.emptyLogger) {
        context.logger = getEmptyLogger();
    } else {
        context.logger = getConsoleLogger();
    }

    if (options.user) {
        context.user = context.userData = {
            distributorId : getTestDistributorId(),
            userId : getTestUserId(),
            user_id: getTestUserId(),
            login : getTestLoginName()
        };
    }

    async.waterfall([
        function (callback) {
            if (options.memcached) {
                applyMiddleware(context, middleware.memcachedConnector, callback);
            } else {
                callback();
            }
        },

        function (callback) {
            if (options.database) {
                applyMiddleware(context, middleware.databaseConnector(), callback);
            } else {
                callback();
            }
        },

        function (callback) {
            if (options.database) {
                applyMiddleware(context, middleware.databaseConnector('read'), callback);
            } else {
                callback();
            }
        },

        function (callback) {
            if (options.redis) {
                applyMiddleware(context, middleware.redisConnector, callback);
            } else {
                callback();
            }
        },

        function (callback) {
            if (options.database) {
                var handler = middleware.sequelizer(
                        path.join(__dirname, MODELS_LOCATION),
                        context.config,
                        context.logger
                    );
                applyMiddleware(context, handler, callback);
            } else {
                callback();
            }
        },

        function (callback) {
            var extend = options.extend,
                key;
            if (extend) {
                for (key in extend) {
                    if (extend.hasOwnProperty(key)) {
                        context[key] = extend[key];
                    }
                }
            }

            callback(null, context);
        }
    ], callback);
}


exports.getContext = getContext;
exports.getDatabaseClient = getDatabaseClient;
exports.getTestUserId = getTestUserId;
exports.getTestDistributorId = getTestDistributorId;
exports.getTestLoginName = getTestLoginName;
exports.getTestUserIdOfCA = getTestUserIdOfCA;
exports.getTestDistributorIdOfCA = getTestDistributorIdOfCA;
exports.getTestLoginNameOfCA = getTestLoginNameOfCA;
exports.getTestAddressIdOfUnitedStates = getTestAddressIdOfUnitedStates;
exports.getTestAddressData = getTestAddressData;
exports.getTestOrderIdOfNormal = getTestOrderIdOfNormal;
exports.getTestOrderIdOfOthers = getTestOrderIdOfOthers;
exports.getTestCreditcardInfoOfNormal = getTestCreditcardInfoOfNormal;
exports.getTestCreditcardInfoWithInvalidCreditcard = getTestCreditcardInfoWithInvalidCreditcard;

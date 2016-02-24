/*
 * Proxy requests about hyperwallet api for signed in users.
 * Fill parameters into url or request body before sending requests to payment server.
 * These parameters are supported:
 *
 * - distributor-id
 * - payment-method-id
 * - currency-code
 */

var async = require('async');
var request = require('request');
var daos = require('../../../daos');
var utils = require('../../../lib/utils');


function getCurrentUser(context, callback) {
    if (context.input.user) {
        callback(null, context.input.user);
        return;
    }

    var userDao = daos.createDao('User', context);
        userId = context.user.userId;

    userDao.getById(userId, function (error, user) {
        if (error) {
            callback(error);
            return;
        }

        context.input.user = user;
        callback(null, user);
    });
}


function getHomeCountryOfCurrentUser(context, callback) {
    async.waterfall([
        function (callback) {
            getCurrentUser(context, callback);
        },

        function (user, callback) {
            var userDao = daos.createDao('User', context);
            userDao.getHomeAddressOfUser(user, callback);
        },

        function (homeAddress, callback) {
            if (!homeAddress) {
                callback(null, null);
                return;
            }

            var countryDao = daos.createDao('Country', context);
            countryDao.getCountryById(homeAddress.country_id, callback);
        }
    ], callback);
}


function getHyperwalletPaymentMethodOfCurrentUser(context, callback) {
    async.waterfall([
        function (callback) {
            getHomeCountryOfCurrentUser(context, callback);
        },

        function (country, callback) {
            var orderDao,
                error;

            if (!country) {
                error = new Error("Home address is not set.");
                error.statusCode = 403;
                callback(error);
                return;
            }

            orderDao = daos.createDao('Order', context);
            orderDao.getAvailableHyperwalletPaymentMethodByCountryId(country.id, callback);
        },

        function (paymentMethod, callback) {
            if (!paymentMethod) {
                var error = new Error("Hyperwallet is not available in your country.");
                error.statusCode = 403;
                callback(error);
                return;
            }

            callback(null, paymentMethod);
        }
    ], callback);
}


function getCurrencyOfCurrentUser(context, callback) {
    async.waterfall([
        function (callback) {
            getHomeCountryOfCurrentUser(context, callback);
        },

        function (country, callback) {
            var currencyDao,
                error;

            if (!country) {
                error = new Error("Home address is not set.");
                error.statusCode = 403;
                callback(error);
                return;
            }

            currencyDao = daos.createDao('Currency', context);
            currencyDao.getCurrencyById(context, country.currency_id, callback);
        }
    ], callback);
}


function fillParametersToUrl(context, url, callback) {
    async.waterfall([
        function (callback) {
            if (url.indexOf('{distributor-id}') === -1) {
                callback();
                return;
            };

            url = url.replace('{distributor-id}', context.user.distributorId);
            callback();
        },

        function (callback) {
            if (url.indexOf('{payment-method-id}') === -1) {
                callback();
                return;
            };

            getHyperwalletPaymentMethodOfCurrentUser(context, function (error, paymentMethod) {
                if (error) {
                    callback(error);
                    return;
                }

                url = url.replace('{payment-method-id}', paymentMethod.id);
                callback();
            });
        },

        function (callback) {
            if (url.indexOf('{currency-code}') === -1) {
                callback();
                return;
            };

            getCurrencyOfCurrentUser(context, function (error, currency) {
                if (error) {
                    callback(error);
                    return;
                }

                url = url.replace('{currency-code}', currency.iso_code);
                callback();
            });
        },

        function (callback) {
            callback(null, url);
        }
    ], callback);
}


function fillParametersToRequestBody(context, body, parameters, callback) {
    async.waterfall([
        function (callback) {
            if (parameters.indexOf('distributor-id') === -1) {
                callback();
                return;
            };

            body['distributor-id'] = context.user.distributorId;
            callback();
        },

        function (callback) {
            if (parameters.indexOf('payment-method-id') === -1) {
                callback();
                return;
            };

            getHyperwalletPaymentMethodOfCurrentUser(context, function (error, paymentMethod) {
                if (error) {
                    callback(error);
                    return;
                }

                body['payment-method-id'] = paymentMethod.id;
                callback();
            });
        },

        function (callback) {
            if (parameters.indexOf('currency-code') === -1) {
                callback();
                return;
            };

            getCurrencyOfCurrentUser(context, function (error, currency) {
                if (error) {
                    callback(error);
                    return;
                }

                body['currency-code'] = currency.iso_code;
                callback();
            });
        },

        function (callback) {
            callback(null, body);
        }
    ], callback);
}


function responseError(response, error) {
    var statusCode = error.statusCode || 500,
        errorCode = error.errorCode,
        errorMessage = error.message;

    response.json(statusCode, {
        code : statusCode,
        error : {
            'error-code' : errorCode,
            message : errorMessage
        }
    });
}


/*
 * Generate the proxy handler.
 *  options = {
 *      url : <String>
 *      method : <String>
 *      bodyParameters : <Array>
 *  }
 */
function proxy(options) {

    return function (req, res, next) {
        var context = req.context,
            logger = context.logger,
            paymentConfig = context.config.payment,
            url = options.url,
            method = options.method,
            bodyParameters = options.bodyParameters,
            body = req.body,
            requestOptions = {};

        context.input = {};

        async.waterfall([
            function (callback) {
                requestOptions.method = method;
                requestOptions.headers = {
                    Accept : 'application/json',
                    'Accept-Language' : 'en-US',
                    'Content-Type' : 'application/json',
                    'User-Agent' : 'mobile-pulse/2.0.0',
                    'X-Client-Id' : paymentConfig.clientId
                };
                requestOptions.timeout = paymentConfig.timeout;

                callback();
            },

            function (callback) {
                fillParametersToUrl(context, url, function (error, url) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    requestOptions.url = paymentConfig.address + url;
                    callback();
                });
            },

            function (callback) {
                if (method !== 'POST' && method !== 'PUT') {
                    callback();
                    return;
                }

                fillParametersToRequestBody(context, body, bodyParameters, function (error, body) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    requestOptions.json = body;
                    callback();
                });
            },

            function (callback) {

                logger.debug("Sending request to payment server: %j", requestOptions);
                request(requestOptions, function (error, response, body) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (typeof(body) === 'string') {
                        body = JSON.parse(body);
                    }
                    res.json(response.statusCode, body);
                });
            }
        ], function (error) {
            if (error) {
                responseError(res, error);
            }
        });
    };
}

module.exports = proxy;

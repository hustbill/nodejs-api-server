// POST /v2/registrations/retail-customers

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');
var cacheKey = require('../../../../lib/cacheKey');
var mailHelper = require('../../../../lib/mailHelper');


function getLineItemsFromData(input, defaultCatalogCode, roleCode) {
    var lineItems = [];

    if (u.isArray(input)) {
        input.forEach(function (lineItem) {
            lineItems.push({
                roleCode : roleCode,
                catalogCode : lineItem['catalog-code'] || defaultCatalogCode,
                variantId : parseInt(lineItem['variant-id'], 10),
                quantity : parseInt(lineItem.quantity, 10),
                personalizedValues : mapper.parseLineItemPersonalizedValues(lineItem['personalized-values'])
            });
        });
    }

    return lineItems;
}

function getPostData(request) {
    var body = request.body,
        data = {};

    data.sponsor = parseInt(body.sponsor, 10) || null;
    data.login = body.login;
    data.password = body.password;
    data.email = body.email;
    data.homeAddress = mapper.parseShippingAddress(body['shipping-address']);
    data.shippingAddress = mapper.parseShippingAddress(body['shipping-address']);
    data.billingAddress = mapper.parseShippingAddress(body['shipping-address']);

    data.lineItems = getLineItemsFromData(body['line-items'], 'RG', 'R');
    data.shippingMethodId = parseInt(body['shipping-method-id'], 10);
    data.paymentMethodId = parseInt(body['payment-method-id'], 10);
    data.creditcard = mapper.parseCreditcard(body.creditcard);
    data.specialInstructions = body['special-instructions'];

    return data;
}


function validatePostData(data, callback) {
    var error;

    if (!data.login) {
        error = new Error('Login is required.');
        error.errorCode = 'InvalidLogin';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (utils.isReservedLogin(data.login)) {
        error = new Error("Login '" + data.login + "' is unavailable.");
        error.errorCode = 'InvalidLogin';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!data.email) {
        error = new Error('Email is required.');
        error.errorCode = 'InvalidEmail';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!utils.isValidEmail(data.email)) {
        error = new Error('Invalid email.');
        error.errorCode = 'InvalidEmail';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!data.password) {
        error = new Error('Password is required.');
        error.errorCode = 'InvalidPassword';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!utils.isValidPassword(data.password)) {
        error = new Error('Invalid password.');
        error.errorCode = 'InvalidPassword';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!data.shippingAddress) {
        error = new Error('Shipping address is required.');
        error.errorCode = 'InvalidShippingAddress';
        error.statusCode = 400;
        callback(error);
        return;
    }

    callback();
}


function lockRegistrationForLogin(context, postData, callback) {
    if (!postData.login) {
        callback();
        return;
    }

    var redisClient = context.redisClient,
        login = postData.login,
        lockName = cacheKey.lockOfRegistrationForLogin(login),
        lockTimeout = 300;   // 5 minutes

    if (context.companyCode) {
        lockName = context.companyCode + '.' + lockName;
    }

    async.waterfall([
        function (callback) {
            redisClient.setnx(lockName, true, callback);
        },

        function (succeeded, callback) {
            if (succeeded) {
                redisClient.expire(lockName, lockTimeout, function () {
                    callback();
                });
                return;
            }

            var error = new Error('Registration request is processing.');
            error.errorCode = 'RequestProcessing';
            error.statusCode = 409;
            callback(error);
        }
    ], callback);
}


function unlockRegistrationForLogin(context, postData, callback) {
    if (!postData.login) {
        callback();
        return;
    }

    var redisClient = context.redisClient,
        login = postData.login,
        lockName = cacheKey.lockOfRegistrationForLogin(login);

    if (context.companyCode) {
        lockName = context.companyCode + '.' + lockName;
    }

    redisClient.del(lockName, function () {
        callback();
    });
}

function callbackSponsorNotFoundError(distributorId, callback) {
    var error = new Error("Sponsor '" + distributorId + "' was not found.");
    error.errorCode = 'SponsorNotFound';
    error.statusCode = 400;
    callback(error);
}

function getSponsorInfo(context, distributorId, callback) {
    var userDao;

    async.waterfall([
        function (next) {
            var distributorDao = daos.createDao('Distributor', context);
            distributorDao.getById(distributorId, function (error, distributor) {
                if (error) {
                    if (error.errorCode === 'DistributorNotFound') {
                        callbackSponsorNotFoundError(distributorId, callback);
                        return;
                    }

                    callback(error);
                    return;
                }

                next(null, distributor);
            });
        },

        function (distributor, next) {
            userDao = daos.createDao('User', context);
            userDao.getById(distributor.user_id, function (error, user) {
                if (error) {
                    if (error.errorCode === 'UserNotFound') {
                        callbackSponsorNotFoundError(distributorId, callback);
                        return;
                    }

                    callback(error);
                    return;
                }

                next(null, user);
            });
        },

        function (user, callback) {
            userDao.getHomeAddressOfUser(user, function (error, homeAddress) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!homeAddress) {
                    callback(null, null);
                    return;
                }

                callback(null, {
                    name : homeAddress.firstname + ' ' + homeAddress.lastname,
                    email : user.email,
                    phone : homeAddress.phone
                });
            });
        }
    ], callback);
}


function createRegistration(context, options, callback) {
    var distributorDao = daos.createDao('Distributor', context),
        orderDao,
        contextOfNewDistributor = {},
        newDistributor,
        newOrder,
        sponsorInfo;

    async.waterfall([
        function (callback) {
            if (!options.sponsor) {
                callback();
                return;
            }

            getSponsorInfo(context, options.sponsor, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                sponsorInfo = result;
                callback();
            });
        },

        function (callback) {
            distributorDao.registerRetailCustomer(options, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                newDistributor = result;
                var key;
                for (key in context) {
                    if (context.hasOwnProperty(key) && key !== 'daos') {
                        contextOfNewDistributor[key] = context[key];
                    }
                }

                contextOfNewDistributor.user = {
                    distributorId : newDistributor.id,
                    userId : newDistributor.user_id,
                    login : options.login,
                    deviceId : context.user && context.user.deviceId,
                    clientId : context.user && context.user.clientId
                };
                callback();
            });
        },

        function (callback) {
            mailHelper.sendRetailCustomerRegistrationEmail(context, newDistributor, function () {
                callback();
            });
        },

        function (callback) {
            if (!options.lineItems || !options.lineItems.length) {
                callback();
                return;
            }

            var createOrderOptions = {
                    registration : true,
                    userId : newDistributor.user_id,
                    roleCode : 'R',
                    lineItems : options.lineItems,
                    shippingAddress : options.shippingAddress,
                    billingAddress : options.billingAddress,
                    shippingMethodId : options.shippingMethodId,
                    paymentMethodId : options.paymentMethodId,
                    creditcard : options.creditcard,
                    specialInstructions : options.specialInstructions
                };

            orderDao = daos.createDao('Order', contextOfNewDistributor);
            orderDao.createOrder(createOrderOptions, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                newOrder = result;
                callback();
            });
        },

        function (callback) {
            callback(null, {
                'distributor-id' : newDistributor.id,
                'order' : mapper.order(newOrder),
                'sponsor' : sponsorInfo
            });
        }
    ], callback);
}

function generateResponse(result) {
    var response = {statusCode : 200};

    response.body = result;

    return response;
}


/**
 *
 * Create registration
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        logger = context.logger,
        orderDao = daos.createDao('Order', context),
        postData = getPostData(request),
        error;

    logger.trace("register retail customer request body: %j", request.body);

    async.waterfall([
        function (callback) {
            validatePostData(postData, callback);
        },

        function (callback) {
            lockRegistrationForLogin(context, postData, callback);
        },

        function (callback) {
            createRegistration(context, postData, callback);
        }
    ], function (error, result) {
        if (error && error.errorCode === 'RequestProcessing') {
            next(error);
            return;
        }

        unlockRegistrationForLogin(context, postData, function () {
            if (error) {
                next(error);
                return;
            }

            var siteUrl = context.config.siteUrl || '';
            response.set('Location', siteUrl + '/v2/distributors/' + result['distributor-id']);
            next(generateResponse(result));
        });
    });
}

module.exports = post;


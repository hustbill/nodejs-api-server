// POST /v2/registrations

var async = require('async');
var u = require('underscore');
var moment = require('moment');
var daos = require('../../../daos');
var utils = require('../../../lib/utils');
var mapper = require('../../../mapper');
var cacheKey = require('../../../lib/cacheKey');
var mailHelper = require('../../../lib/mailHelper');
var requests = require('request');


function getLineItemsFromData(input, defaultCatalogCode, roleCode) {
    var lineItems = [];

    if (u.isArray(input)) {
        input.forEach(function(lineItem) {
            lineItems.push({
                roleCode: roleCode,
                catalogCode: lineItem['catalog-code'] || defaultCatalogCode,
                variantId: parseInt(lineItem['variant-id'], 10),
                quantity: parseInt(lineItem.quantity, 10),
                personalizedValues: mapper.parseLineItemPersonalizedValues(lineItem['personalized-values'])
            });
        });
    }

    return lineItems;
}

function parseSecurityQuestions(data) {
    if (!data) {
        return null;
    }

    var securityQuestions = [];

    if (data['default-questions']) {
        data['default-questions'].forEach(function(item) {
            securityQuestions.push({
                id: item.id,
                answer: item.answer
            });
        });
    }

    if (data['user-defined-questions']) {
        data['user-defined-questions'].forEach(function(item) {
            securityQuestions.push({
                question: item.question,
                answer: item.answer
            });
        });
    }

    return securityQuestions;
}

function parseUserInfo(data) {
    var userInfo = {
        sponsor: parseInt(data.sponsor, 10) || null,
        dualteamSponsorId: parseInt(data['dualteam-sponsor'], 10) || null,
        dualteamPlacement: data['dualteam-placement'],
        roleCode: data['role-code'],
        login: data.login,
        password: data.password,
        email: data.email,
        birthday: data.birthday,
        socialSecurityNumber: data['social-security-number'],
        taxnumber: data['tax-id'],
        countryIso: data['country-iso'],
        securityQuestions: parseSecurityQuestions(data['security-questions']),
        company: data.company
    };

    //for MMD
    if (data['forced-matrix']) {
        userInfo.forcedMatrix = {
            level: data['forced-matrix'].level,
            position: data['forced-matrix'].position
        };
    }

    return userInfo;
}


function getPostData(request) {
    var body = request.body,
        data = {};

    data.homeAddress = mapper.parseHomeAddress(body['home-address']);
    data.shippingAddress = mapper.parseShippingAddress(body['shipping-address']);
    data.billingAddress = mapper.parseBillingAddress(body['billing-address']);
    data.websiteAddress = mapper.parseWebsiteAddress(body['website-address']);

    data.shippingMethodId = parseInt(body['shipping-method-id'], 10);
    data.paymentMethodId = parseInt(body['payment-method-id'], 10);

    data.creditcard = mapper.parseCreditcard(body.creditcard);

    data.userInfo = parseUserInfo(body['user-info']);
    if(data.userInfo.company && u.isString(data.userInfo.company)){
        data.userInfo.company = data.userInfo.company.trim();
    }
    else {
        data.userInfo.company = null;
    }

    data.specialInstructions = body['special-instructions'];

    data.lineItems = getLineItemsFromData(body['line-items'], 'RG', data.userInfo.roleCode);
    data.autoshipItems = getLineItemsFromData(body['autoship-items'], 'AT', data.userInfo.roleCode);


    return data;
}

function validateSponsor(options, callback) {
    var userInfo = options.userInfo;
    var context = options.context;

    var distributorDao = daos.createDao('Distributor', context);
    async.waterfall([
        function (callback) {
            if (userInfo.sponsor) {
                distributorDao.validateSponsorByDsitributorId(
                    {distributorId: userInfo.sponsor},
                    callback
                );
                return;
            }
            callback();
        },
        function (callback) {
            if (userInfo.dualteamSponsorId) {
                distributorDao.validateSponsorByDsitributorId(
                    {distributorId: userInfo.dualteamSponsorId},
                    callback
                );
                return;
            }
            callback();
        },
    ], function (error) {
        callback(error);
    });
}

/**
 * validate sponsor id
 * @param {Object} options
 *   options:
 *     context {Object} Request's context
 *     userInfo {Object} The user info of post data
 * @param {Function} callback The async water fall callback function
 * @return {Boolean} Is valid or not
 */
function validateSponsorId (options, callback) {
    var context = options.context;
    var userInfo = options.userInfo;
    var isValid = true;

    if(context.companyCode !== 'MMD'){
        if (userInfo.roleCode !== 'R' && !userInfo.sponsor) {
            error = new Error('Sponsor is required.');
            error.errorCode = 'InvalidSponsor';
            error.statusCode = 400;
            callback(error);
            isValid = false;
        }
    }
    else { //MMD company
        if(!userInfo.sponsor) {
            error = new Error('Sponsor is required.');
            error.errorCode = 'InvalidSponsor';
            error.statusCode = 400;
            callback(error);
            isValid = false;
        }
    }

    return isValid;
}

/**
 * validate sponsor id
 * @param {Object} options
 *   options:
 *     context {Object} Request's context
 *     postData {Object} The post data object
 * @param {Function} callback The callback function
 * @return {undefined}
 */
function validatePostData(options, callback) {
    var context = options.context;
    var data = options.postData;
    var userInfo = data.userInfo;
    var error;

    if (!userInfo) {
        error = new Error('User info is required.');
        error.errorCode = 'InvalidUserInfo';
        error.statusCode = 400;
        callback(error);
        return;
    }

    var isValidSponsorId = validateSponsorId({context: context, userInfo: userInfo}, callback);
    if(!isValidSponsorId) {
        return;
    }

    if (userInfo.dualteamSponsorId && !userInfo.dualteamPlacement) {
        error = new Error("Parameter 'dualteam-placement' is required.");
        error.errorCode = 'InvalidDualteamPlacement';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (userInfo.dualteamPlacement &&
            (
                userInfo.dualteamPlacement !== 'A' &&
                userInfo.dualteamPlacement !== 'L' &&
                userInfo.dualteamPlacement !== 'R'
            )
        )
    {
        error = new Error("Parameter 'dualteam-placement' is invalid. Must be 'A', 'L' or 'R'.");
        error.errorCode = 'InvalidDualteamPlacement';
        error.statusCode = 400;
        callback(error);
        return;
    }


    if (!userInfo.roleCode) {
        error = new Error('Role code is required.');
        error.errorCode = 'InvalidRoleCode';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!userInfo.login) {
        error = new Error('Login is required.');
        error.errorCode = 'InvalidLogin';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (utils.isReservedLogin(userInfo.login)) {
        error = new Error("Login '" + userInfo.login + "' is unavailable.");
        error.errorCode = 'InvalidLogin';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!userInfo.email) {
        error = new Error('Email is required.');
        error.errorCode = 'InvalidEmail';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!utils.isValidEmail(userInfo.email)) {
        error = new Error('Invalid email.');
        error.errorCode = 'InvalidEmail';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!userInfo.password) {
        error = new Error('Password is required.');
        error.errorCode = 'InvalidPassword';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!utils.isValidPassword(userInfo.password)) {
        error = new Error('Invalid password.');
        error.errorCode = 'InvalidPassword';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (utils.isNullOrEmpty(userInfo.birthday) ||
        !moment(userInfo.birthday, 'YYYY-MM-DD', true).isValid())
    {
        error = new Error('Invalidate birthday, the input needs to be in YYYY-MM-DD format, for example 1956-01-30.');
        error.errorCode = 'InvalidBirthday';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!data.homeAddress) {
        error = new Error('Home address is required.');
        error.errorCode = 'InvalidHomeAddress';
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

    if (userInfo.forcedMatrix && userInfo.forcedMatrix.level && userInfo.forcedMatrix.position) {
        userInfo.forcedMatrix.level = parseInt(userInfo.forcedMatrix.level, 10);
        userInfo.forcedMatrix.position = parseInt(userInfo.forcedMatrix.position, 10);
        if (!u.isFinite(userInfo.forcedMatrix.level)) {
            error = new Error('Invalid level.');
            error.errorCode = 'InvalidLevel';
            error.statusCode = 400;
            callback(error);
            return;
        }
        if (!u.isFinite(userInfo.forcedMatrix.position)) {
            error = new Error('Invalid position.');
            error.errorCode = 'InvalidPosition';
            error.statusCode = 400;
            callback(error);
            return;
        }
    }

    callback();
}


function lockRegistrationForLogin(context, postData, callback) {
    if (!postData.userInfo || !postData.userInfo.login) {
        callback();
        return;
    }

    var redisClient = context.redisClient,
        login = postData.userInfo.login,
        lockName = cacheKey.lockOfRegistrationForLogin(login),
        lockTimeout = 300; // 5 minutes

    if (context.companyCode) {
        lockName = context.companyCode + '.' + lockName;
    }

    async.waterfall([
        function(callback) {
            redisClient.setnx(lockName, true, callback);
        },

        function(succeeded, callback) {
            if (succeeded) {
                redisClient.expire(lockName, lockTimeout, function() {
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
    if (!postData.userInfo || !postData.userInfo.login) {
        callback();
        return;
    }

    var redisClient = context.redisClient,
        login = postData.userInfo.login,
        lockName = cacheKey.lockOfRegistrationForLogin(login);

    if (context.companyCode) {
        lockName = context.companyCode + '.' + lockName;
    }

    redisClient.del(lockName, function() {
        callback();
    });
}


function lockRegistrationForDualteam(context, postData, callback) {
    if (!postData.userInfo || !postData.userInfo.dualteamSponsorId) {
        callback();
        return;
    }

    var redisClient = context.redisClient,
        userInfo = postData.userInfo,
        lockName = cacheKey.lockOfRegistrationForDualteam(userInfo.dualteamSponsorId, userInfo.dualteamPlacement),
        lockTimeout = 300; // 5 minutes

    if (context.companyCode) {
        lockName = context.companyCode + '.' + lockName;
    }

    async.waterfall([
        function(callback) {
            redisClient.setnx(lockName, true, callback);
        },

        function(succeeded, callback) {
            if (succeeded) {
                redisClient.expire(lockName, lockTimeout, function() {
                    callback();
                });
                return;
            }

            var error = new Error('Dualteam position is locked.');
            error.errorCode = 'DualteamPositionLocked';
            error.statusCode = 409;
            callback(error);
        }
    ], callback);
}


function unlockRegistrationForDualteam(context, postData, callback) {
    if (!postData.userInfo || !postData.userInfo.dualteamSponsorId) {
        callback();
        return;
    }

    var redisClient = context.redisClient,
        userInfo = postData.userInfo,
        lockName = cacheKey.lockOfRegistrationForDualteam(userInfo.dualteamSponsorId, userInfo.dualteamPlacement);

    if (context.companyCode) {
        lockName = context.companyCode + '.' + lockName;
    }

    redisClient.del(lockName, function() {
        callback();
    });
}

function lockRegistrationForForcedMatrix(context, forcedMatrix, callback) {

    if (context.companyCode !== 'MMD' || !forcedMatrix) {
        callback();
        return;
    }

    var redisClient = context.redisClient;
    var lockName = cacheKey.lockOfRegistrationForForcedMatrix(forcedMatrix);
    var lockTimeout = 300; // 5 minutes

    if (context.companyCode) {
        lockName = context.companyCode + '.' + lockName;
    }

    async.waterfall([
        function(callback) {
            redisClient.setnx(lockName, true, callback);
        },

        function(succeeded, callback) {
            if (succeeded) {
                redisClient.expire(lockName, lockTimeout, function() {
                    callback();
                });
                return;
            }

            var error = new Error('ForcedMatrix position is locked.');
            error.errorCode = 'ForcedMatrixPositionLocked';
            error.statusCode = 409;
            callback(error);
        }
    ], callback);

}

function unlockRegistrationForForcedMatrix(context, forcedMatrix, callback) {

    if (context.companyCode !== 'MMD' || !forcedMatrix) {
        callback();
        return;
    }
    var redisClient = context.redisClient;
    var lockName = cacheKey.lockOfRegistrationForForcedMatrix(forcedMatrix);

    if (context.companyCode) {
        lockName = context.companyCode + '.' + lockName;
    }

    redisClient.del(lockName, function() {
        callback();
    });
}

function validateForcedMatrix(context, forcedMatrix, sponsorId, callback) {

    if (context.companyCode !== 'MMD' || !forcedMatrix) {
        callback();
        return;
    }

    var logger = context.logger;
    var error;


    var forcedMatrixDAO = daos.createDao('ForcedMatrix', context);

    forcedMatrixDAO.canAddByLevelAndPosition({
        sponsorId: sponsorId,
        level: forcedMatrix.level,
        position: forcedMatrix.position
    }, function(error, canAdd) {
        if (error) {
            callback(error);
            return;
        }
        if (!canAdd) {
            error = new Error('Invalid level and position.');
            error.errorCode = 'InvalidLevelAndPosition';
            error.statusCode = 400;
            callback(error);
            return;
        }

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
        function(next) {
            var distributorDao = daos.createDao('Distributor', context);
            distributorDao.getById(distributorId, function(error, distributor) {
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

        function(distributor, next) {
            userDao = daos.createDao('User', context);
            userDao.getById(distributor.user_id, function(error, user) {
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

        function(user, callback) {
            userDao.getHomeAddressOfUser(user, function(error, homeAddress) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!homeAddress) {
                    callback(null, null);
                    return;
                }

                callback(null, {
                    name: homeAddress.firstname + ' ' + homeAddress.lastname,
                    email: user.email,
                    phone: homeAddress.phone
                });
            });
        }
    ], callback);
}


function createRegistration(context, options, callback) {
    var logger = context.logger,
        distributorDao = daos.createDao('Distributor', context),
        orderDao,
        contextOfNewDistributor = {},
        newDistributor,
        sponsorInfo;

    async.waterfall([
        function(callback) {
            if (!options.userInfo.sponsor) {
                callback();
                return;
            }

            getSponsorInfo(context, options.userInfo.sponsor, function(error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                sponsorInfo = result;
                callback();
            });
        },

        function(callback) {
            // validate dualteam placement
            var dualteamSponsorId = options.userInfo.dualteamSponsorId,
                dualteamPlacement = options.userInfo.dualteamPlacement;

            if (!dualteamSponsorId) {
                callback();
                return;
            }

            distributorDao.validateDualteamSponsorPlacement(dualteamSponsorId, dualteamPlacement, function(error, available) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!available) {
                    error = new Error("Parameter 'dualteam-placement' is invalid.");
                    error.errorCode = 'InvalidDualteamPlacement';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function(callback) {
            var registerDistributorOptions = options.userInfo;

            registerDistributorOptions.homeAddress = options.homeAddress;
            registerDistributorOptions.shippingAddress = options.shippingAddress;
            registerDistributorOptions.billingAddress = options.billingAddress;
            registerDistributorOptions.websiteAddress = options.websiteAddress;

            distributorDao.registerDistributor(registerDistributorOptions, callback);
        },

        function(result, callback) {
            newDistributor = result;

            var key;
            for (key in context) {
                if (context.hasOwnProperty(key) && key !== 'daos') {
                    contextOfNewDistributor[key] = context[key];
                }
            }

            contextOfNewDistributor.user = {
                distributorId: newDistributor.id,
                userId: newDistributor.user_id,
                login: options.userInfo.login,
                deviceId: context.user && context.user.deviceId,
                clientId: context.user && context.user.clientId
            };

            callback();
        },

        function(callback) {
            var createOrderOptions = {
                registration: true,
                userId: newDistributor.user_id,
                roleCode: options.userInfo.roleCode,
                dualteamOptions: {
                    dualteamSponsorId: options.userInfo.dualteamSponsorId,
                    dualteamPlacement: options.userInfo.dualteamPlacement
                },
                forcedMatrixOptions: options.userInfo.forcedMatrix,
                lineItems: options.lineItems,
                shippingAddress: options.shippingAddress,
                billingAddress: options.billingAddress,
                shippingMethodId: options.shippingMethodId,
                paymentMethodId: options.paymentMethodId,
                creditcard: options.creditcard,
                specialInstructions: options.specialInstructions
            };

            orderDao = daos.createDao('Order', contextOfNewDistributor);
            orderDao.createOrder(createOrderOptions, callback);
        },

        function(order, next) {
            if (order.state !== 'complete') {
                callback(null, {
                    'distributor-id': newDistributor.id,
                    'order': mapper.orderResult(order),
                    'sponsor': sponsorInfo
                });
                return;
            }
            next(null, order);
        },

        function(order, callback) {
            var autoshipItems = options.autoshipItems,
                autoshipDao,
                createAutoshipOptions;

            if (!autoshipItems || !autoshipItems.length) {
                callback(null, order);
                return;
            }

            autoshipDao = daos.createDao('Autoship', contextOfNewDistributor);
            createAutoshipOptions = {
                userId: newDistributor.user_id,
                autoshipItems: autoshipItems,
                shippingAddress: options.shippingAddress,
                billingAddress: options.billingAddress,
                shippingMethodId: order.shipping_method_id,
                paymentMethodId: options.paymentMethodId,
                creditcard: options.creditcard
            };

            autoshipDao.createAutoship(createAutoshipOptions, function(error) {
                if (error) {
                    logger.error("Failed to create autoship: %s", error.message);
                }

                callback(null, order);
            });
        },

        function(order, callback) {

            //Retail Customer
            if (options.userInfo && options.userInfo.roleCode === 'R') {
                mailHelper.sendRetailCustomerRegistrationEmail(context, newDistributor, function() {
                    callback(null, order);
                });

                return;
            }

            callback(null, order);
        },

        function(order, callback) {
            // create hyperwallet account
            if (!context.config.application.create_hyperwallet_account) {
                callback(null, order);
                return;
            }
            var homeAddress = options.homeAddress;
            getHyperwalletPaymentMethod(homeAddress.country_id,
                orderDao,
                function(error, paymentMethod) {
                    if (!paymentMethod) {
                        callback(null, order);
                        return;
                    }
                    var addressDao = daos.createDao('Address', context),
                        countryDao = daos.createDao('Country', context);
                    addressDao.getStateOfAddress(homeAddress, function(error, state) {
                        countryDao.getCountryById(homeAddress.country_id,
                            function(error, country) {
                                var inputData = homeAddress;
                                homeAddress.stateName = (state) ? state.name : "";
                                homeAddress.countryISO = (country) ? country.iso : "";

                                inputData.homeAddress = homeAddress;
                                inputData.paymentMethodId = paymentMethod.id;
                                inputData.birthday = options.birthday;
                                inputData.email = options.email;
                                inputData.distributorId = newDistributor.id;

                                createHyperwalletAccount(context, inputData);
                                callback(null, order);
                                return;
                            });
                    });
                });

        },

        function(order, callback) {
            callback(null, {
                'distributor-id': newDistributor.id,
                'order': mapper.orderResult(order),
                'sponsor': sponsorInfo
            });
        }
    ], callback);
}

function generateResponse(result) {
    var response = {
        statusCode: 200
    };

    response.body = result;

    return response;
}

function getHyperwalletPaymentMethod(countryId, orderDao, callback) {
    orderDao.getAvailableHyperwalletPaymentMethodByCountryId(countryId, callback);
}

function createHyperwalletAccount(context, inputData) {
    var paymentConfig = context.config.payment,
        serverAddress = paymentConfig.address,
        clientId = paymentConfig.clientId,
        logger = context.logger,
        timeout = paymentConfig.timeout,
        url = serverAddress + '/hyperwallets/accounts',
        address = inputData.homeAddress,
        countryId = address.country_id,
        requestData,
        requestOptions;

    requestData = {
        "distributor-id": inputData.distributorId,
        "payment-method-id": inputData.paymentMethodId,
        "notification-email": inputData.email,
        "date-of-birth": inputData.birthday,
        "first-name": address.firstname,
        "last-name": address.lastname,
        "street": address.address1,
        "city": address.city,
        "zip": address.zipcode,
        "state": address.stateName,
        "country-iso": address.countryISO,
        "phone": address.phone || ''
    };

    requestOptions = {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Accept-Language': 'en-US',
            'Content-Type': 'application/json',
            'User-Agent': 'mobile-pulse/2.0.0',
            'X-Client-Id': clientId
        },
        url: url,
        timeout: timeout,
        json: requestData
    };

    logger.debug('Sending create Hyperwallet account request to payment server: %s', serverAddress);
    logger.debug(requestData);

    requests(requestOptions, function(error, response, body) {});
}

function validateSponsor(options, callback) {
    var userInfo = options.userInfo;
    var context = options.context;

    var distributorDao = daos.createDao('Distributor', context);
    async.waterfall([
        function (callback) {
            if (userInfo.sponsor) {
                distributorDao.validateSponsorByDsitributorId(
                    {distributorId: userInfo.sponsor},
                    callback
                );
                return;
            }
            callback();
        },
        function (callback) {
            if (userInfo.dualteamSponsorId) {
                distributorDao.validateSponsorByDsitributorId(
                    {distributorId: userInfo.dualteamSponsorId},
                    callback
                );
                return;
            }
            callback();
        },
    ], function (error) {
        callback(error);
    });
}

/**
 *
 * Create registration
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context;
    var logger = context.logger;
    var orderDao = daos.createDao('Order', context);
    var postData = getPostData(request);
    var error;

    async.waterfall([
        function(callback) {
            logger.debug('validatePostData');
            validatePostData({
                postData: postData,
                context: context
            }, callback);
        },

        function(callback) {
            logger.debug('validateSponsor');
            validateSponsor({
                userInfo: postData.userInfo,
                context: context
            }, callback);
        },

        function(callback) {
            logger.debug('lockRegistrationForForcedMatrix');
            lockRegistrationForForcedMatrix(context, postData.userInfo.forcedMatrix, callback);
        },

        function(callback) {
            logger.debug('validatePostData');
            validateForcedMatrix(context, postData.userInfo.forcedMatrix, postData.userInfo.sponsor, callback);
        },

        function(callback) {
            logger.debug('lockRegistrationForLogin');
            lockRegistrationForLogin(context, postData, callback);
        },

        function(callback) {
            logger.debug('lockRegistrationForDualteam');
            lockRegistrationForDualteam(context, postData, callback);
        },
        function(callback) {
            logger.debug('createRegistration');
            createRegistration(context, postData, callback);
        }
    ], function(error, result) {
        if (error && error.errorCode === 'RequestProcessing') {
            next(error);
            return;
        }

        //
        unlockRegistrationForForcedMatrix(context, postData.userInfo.forcedMatrix, function() {});

        unlockRegistrationForLogin(context, postData, function() {
            if (error && error.errorCode === 'DualteamPositionLocked') {
                next(error);
                return;
            }

            unlockRegistrationForDualteam(context, postData, function() {
                if (error) {
                    next(error);
                    return;
                }

                var siteUrl = context.config.siteUrl || '';
                response.set('Location', siteUrl + '/v2/distributors/' + result['distributor-id']);
                next(generateResponse(result));
            });
        });
    });
}

module.exports = post;
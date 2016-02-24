// POST /v2/registrations/upgrade-to-distributor

var async = require('async');
var u = require('underscore');
var moment = require('moment');
var daos = require('../../../../daos');
var DAO = require('../../../../daos/DAO');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');
var cacheKey = require('../../../../lib/cacheKey');
var requests = require('request');


function getPostData(request) {
    var body = request.body,
        lineItems = body['line-items'],
        data = {
            lineItems : []
        };

    if (u.isArray(lineItems)) {
        lineItems.forEach(function (lineItem) {
            data.lineItems.push({
                catalogCode : lineItem['catalog-code'] || 'RG',
                roleCode : lineItem['role-code'],
                variantId : parseInt(lineItem['variant-id'], 10),
                quantity : parseInt(lineItem.quantity, 10),
                personalizedValues : mapper.parseLineItemPersonalizedValues(lineItem['personalized-values'])
            });
        });
    }

    data.shippingAddress = mapper.parseShippingAddress(body['shipping-address']);
    data.billingAddress = mapper.parseBillingAddress(body['billing-address']);

    data.shippingMethodId = parseInt(body['shipping-method-id'], 10);
    data.paymentMethodId = parseInt(body['payment-method-id'], 10);
    if (body.hasOwnProperty('payment-amount')) {
        data.paymentAmount = parseFloat(body['payment-amount']);
    }

    data.creditcard = mapper.parseCreditcard(body.creditcard);
    data.specialInstructions = body['special-instructions'];

    if (body['optional-fields']) {
        data.eventCode = body['optional-fields']['event-code'];
    }

    return data;
}


function generateResponse(order) {
    return {
        statusCode : 201,
        body : {
            'order-id' : order.id,
            'order-number' : order.number,
            'order-date' : order.order_date,
            'total' : order.total,
            'state' : order.state,
            'payment-state' : order.payment_state,
            'payment-total' : order.payment_total,
            'payment-date' : order.completed_at
        }
    };
}


function assertUserIsNotDistributor(userDao, user, callback) {
    async.waterfall([
        function (callback) {
            userDao.isDistributor(user, callback);
        },

        function (isDistributor, callback) {
            if (isDistributor) {
                var error = new Error("You are a distributor. No need to upgrade.");
                error.statusCode = 403;
                callback(error);
                return;
            }

            callback();
        }
    ], callback);
}


function validatePersonalSponsorDistributorId(context, distributor, personalSponsorDistributorId, callback) {
    if (distributor.personal_sponsor_distributor_id && !personalSponsorDistributorId) {
        callback();
        return;
    }

    if (!personalSponsorDistributorId) {
        var error = new Error("'sponsor' is required.");
        error.errorCode = 'InvalidSponsorId';
        error.statusCode = 400;
        callback(error);
        return;
    }

    callback();
}


function updatePersonalSponsorDistributorId(context, distributor, personalSponsorDistributorId, callback) {
    var distributorDao = daos.createDao('Distributor', context);

    async.waterfall([
        function (next) {
            if (distributor.personal_sponsor_distributor_id && !personalSponsorDistributorId) {
                callback();
                return;
            }

            if (!personalSponsorDistributorId) {
                var error = new Error("'sponsor' is required.");
                error.errorCode = 'InvalidSponsorId';
                error.statusCode = 400;
                callback(error);
                return;
            }

            distributorDao.getById(personalSponsorDistributorId, next);
        },

        function (sponsorDistributor, callback) {
            distributorDao.updatePersonalSponsorDistributorIdOfDistributor(distributor, sponsorDistributor.id, callback);
        }
    ], callback);
}


function validateSocialSecurityNumber(context, user, distributor, socialSecurityNumber, callback) {
    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getCountryOfUser(user, callback);
        },

        function (country, next) {
            if (country && country.iso === 'US') {
                next();
                return;
            }

            callback();
        },

        function (callback) {
            var distributorDao = daos.createDao('Distributor', context);
            var ssnOrTaxNumber =
                distributorDao.getTaxNumberOfDistributor({distributor: distributor});

            if (ssnOrTaxNumber && !socialSecurityNumber) {
                callback();
                return;
            }

            if (!socialSecurityNumber) {
                var error = new Error("Social security number is required.");
                error.errorCode = 'InvalidSocialSecurityNumber';
                error.statusCode = 400;
                callback(error);
                return;
            }

            if (!/^\d{9}$/.test(socialSecurityNumber)) {
                error = new Error('Social security number must be 9 digits.');
                error.errorCode = 'InvalidSocialSecurityNumber';
                error.statusCode = 400;
                callback(error);
                return;
            }

            callback();
        }
    ], callback);
}


function updateSocialSecurityNumber(context, user, distributor, socialSecurityNumber, callback) {
    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getCountryOfUser(user, callback);
        },

        function (country, next) {
            if (country && country.iso === 'US') {
                next();
                return;
            }

            callback();
        },

        function (callback) {
            var distributorDao = daos.createDao('Distributor', context);
            var ssnOrTaxNumber =
                distributorDao.getTaxNumberOfDistributor({distributor: distributor});

            if (ssnOrTaxNumber && !socialSecurityNumber) {
                callback();
                return;
            }

            if (!socialSecurityNumber) {
                var error = new Error("'SSN/Tax ID' is required.");
                error.errorCode = 'InvalidSocialSecurityNumber';
                error.statusCode = 400;
                callback(error);
                return;
            }

            distributorDao.updateSocialSecurityNumber(distributor, socialSecurityNumber, callback);
        }
    ], callback);
}


function restoreRoleAndStatusOfUser(userDao, user, callback) {
    async.waterfall([
        function (next) {
            userDao.isUserWithStatusByName(user, 'Active', function (error, isActive) {
                if (error) {
                    callback();
                    return;
                }

                if (isActive) {
                    callback();
                    return;
                }

                next();
            });
        },

        function (callback) {
            userDao.changeRoleOfUserByRoleCode(user, 'R', callback);
        },

        function (callback) {
            userDao.setStatusOfUserByStatusName(user, 'Active', callback);
        }
    ], callback);
}

/**
 *
 * Upgrade to distributor
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        logger = context.logger,
        createOrderOptions = getPostData(request),
        creditcard = createOrderOptions.creditcard,
        userDao = daos.createDao('User', context),
        distributorDao = daos.createDao('Distributor', context),
        orderDao = daos.createDao('Order', context),
        personalSponsorDistributorId = parseInt(request.body.sponsor, 10) || null,
        socialSecurityNumber = request.body['social-security-number'],
        roleChanged = false,
        userId = context.user.userId,
        user,
        distributor,
        error;

    logger.trace("upgrade to distributor request body: %j", request.body);

    if (creditcard) {
        if (!utils.isValidCreditcardInfo(creditcard)) {
            error = new Error('Invalid credit card info.');
            error.errorCode = 'InvalidCreditcardInfo';
            error.statusCode = 400;

            logger.error('Invalid credit card info. %j', creditcard);
            next(error);
            return;
        }

        if (creditcard.year.length === 2) {
            creditcard.year = (new Date()).getFullYear().toString().substr(0, 2) + creditcard.year;
        }
        if (creditcard.month.length === 1) {
            creditcard.month = '0' + creditcard.month;
        }
    }

    async.waterfall([
        function (callback) {
            userDao.getById(userId, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                user = result;
                callback();
            });
        },

        function (callback) {
            assertUserIsNotDistributor(userDao, user, callback);
        },

        function (callback) {
            distributorDao.getDistributorByUserId(userId, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                distributor = result;
                callback();
            });
        },

        function (callback) {
            validatePersonalSponsorDistributorId(context, distributor, personalSponsorDistributorId, callback);
        },

        function (callback) {
            validateSocialSecurityNumber(context, user, distributor, socialSecurityNumber, callback);
        },

        function (callback) {
            updatePersonalSponsorDistributorId(context, distributor, personalSponsorDistributorId, callback);
        },

        function (callback) {
            updateSocialSecurityNumber(context, user, distributor, socialSecurityNumber, callback);
        },

        function (callback) {
            userDao.setStatusOfUserByStatusName(user, 'Unregistered', callback);
        },

        function (callback) {
            userDao.changeRoleOfUserByRoleCode(user, 'D', function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                roleChanged = true;
                callback();
            });
        },

        function (callback) {
            createOrderOptions.userId = context.user.userId;
            createOrderOptions.specialInstructions = 'upgrade to distributor order';
            orderDao.createOrder(createOrderOptions, callback);
        },

        function (order, callback) {
            if (order.state !== 'complete' ||
                    (order.payment_state !== 'paid' && order.payment_state !== 'credit_owed')) {
                restoreRoleAndStatusOfUser(userDao, user, function () {
                    callback(null, order);
                });
                return;
            } else {
                callback(null, order);
            }
        }
    ], function (error, order) {
        if (error) {
            if (!roleChanged) {
                next(error);
                return;
            }

            restoreRoleAndStatusOfUser(userDao, user, function () {
                next(error);
            });
            return;
        }

        var siteUrl = context.config.siteUrl || '';
        response.set('Location', siteUrl + '/v2/orders/' + order.id);
        next(generateResponse(order));
    });
}

module.exports = post;


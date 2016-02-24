// POST /v2/registrations/distributors-without-order

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');
var cacheKey = require('../../../../lib/cacheKey');
var mailHelper = require('../../../../lib/mailHelper');


function getPostData(request) {
    var body = request.body,
        data = {};

    data.sponsor = parseInt(body.sponsor, 10) || null;
    data.login = body.login;
    data.password = body.password;
    data.email = body.email;
    data.homeAddress = mapper.parseHomeAddress(body['home-address']);
    data.shippingAddress = mapper.parseShippingAddress(body['shipping-address']);
    data.billingAddress = mapper.parseShippingAddress(body['home-address']);

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
            options.roleCode = 'D';
            options.statusName = 'Active';
            distributorDao.registerDistributor(options, callback);
        },

        function (result, callback) {
            newDistributor = result;

            mailHelper.sendDistributorRegistrationEmail(context, newDistributor, function () {
                callback();
            });
        },

        function (callback) {
            callback(null, {
                'distributor-id' : newDistributor.id,
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
        orderDao = daos.createDao('Order', context),
        postData = getPostData(request),
        error;

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


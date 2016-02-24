/**
 * Check if the given email or login is available for new registration.
 */

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');

function isEmailAvailable(context, email, callback) {
    var userDao = daos.createDao('User', context);

    async.waterfall([
        function (next) {
            if (!utils.isValidEmail(email)) {
                callback(null, false);
                return;
            }

            if (!context.config.application.unique_email) {
                callback(null, true);
                return;
            }

            userDao.getUserByEmail(email, next);
        },

        function (user, next) {
            if (!user) {
                callback(null, true);
                return;
            }

            userDao.isUserRegisteredById(user.id, next);
        },

        function (isRegistered, callback) {
            callback(null, !isRegistered);
        }
    ], callback);
}

function isLoginAvailable(context, login, callback) {
    var userDao = daos.createDao('User', context);

    if (utils.isReservedLogin(login)) {
        error = new Error("Login '" + login + "' is unavailable.");
        error.errorCode = 'InvalidLogin';
        error.statusCode = 400;
        callback(error);
        return;
    }

    async.waterfall([
        function (next) {
            login = login.toLowerCase();

            userDao.validateUserLogin(login, function (error, failures) {
                if (error) {
                    callback(error);
                    return;
                }

                if (failures.length) {
                    callback(null, false);
                    return;
                }

                userDao.getUserByLogin(login, next);
            });
        },

        function (user, next) {
            if (!user) {
                callback(null, true);
                return;
            }

            userDao.isUserRegisteredById(user.id, next);
        },

        function (isRegistered, callback) {
            callback(null, !isRegistered);
        }
    ], callback);
}

function isSSNAvailable(context, ssn, callback) {
    async.waterfall([
        function (next) {
            if (!/^\d{9}$/.test(ssn)) {
                callback(null, false);
                return;
            }
            
            var distributorDao = daos.createDao('Distributor', context);
            distributorDao.getDistributorBySSN(ssn, next);
        },

        function (distributor, next) {
            if (!distributor) {
                callback(null, true);
                return;
            }

            var userDao = daos.createDao('User', context);
            userDao.isUserRegisteredById(distributor.user_id, next);
        },

        function (isRegistered, callback) {
            callback(null, !isRegistered);
        }
    ], callback);
}

function generateResult(result) {
    return {
        statusCode : 200,
        body : result
    };
}

/**
 *
 * Check if the given email or login is available for new registration.
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        userDao = daos.createDao('User', context),
        email = request.query.email,
        login = request.query.login,
        ssn = request.query.ssn,
        error;

    async.waterfall([
        function (callback) {
            if (email) {
                isEmailAvailable(context, email, callback);
            } else if (login) {
                isLoginAvailable(context, login, callback);
            } else if (ssn) {
                isSSNAvailable(context, ssn, callback);
            } else {
                error = new Error("Email or login is required.");
                error.statusCode = 400;
                callback(error);
            }
        }

    ], function (error, available) {
        if (error) {
            next(error);
            return;
        }

        next(generateResult({
            available : available
        }));
    });
}

module.exports = get;

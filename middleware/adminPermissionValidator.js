var async = require('async');
var daos = require('../daos');


function validator() {
    return function (req, res, next) {
        var context = req.context,
            logger = context.logger,
            userId = context.user.userId;

        async.waterfall([
            function (callback) {
                var userDao = daos.createDao('User', context);
                userDao.getCurrentOperator(callback);
            },

            function (operator, callback) {
                if (!operator.isAdmin) {
                    var error = new Error("You have no permission to call this api.");
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            }

        ], function (error) {
            if (error) {
                logger.debug('admin permission validated fail: %s', error.message);
                next(error);
                return;
            }

            logger.debug('admin permission validated ok.');

            next();
        });
    };
}

module.exports = validator;

// GET /v2/profile/validate

var async = require('async');
var daos = require('../../../../daos');


/**
 * Change password of user
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        userId = context.user.userId,
        userDao = daos.createDao('User', context),
        error;

    async.waterfall([
        function (callback) {
            userDao.getById(userId, callback);
        },
        function (user, callback) {
            userDao.validateProfileAddressesOfUser(user, function (error, validateResults) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, {
                    'home-address-failures' : validateResults.homeAddress || [],
                    'billing-address-failures' : validateResults.billingAddress || [],
                    'shipping-address-failures' : validateResults.shippingAddress || [],
                    'website-address-failures' : validateResults.websiteAddress || []
                });
            });
        }
    ], function (error, result) {
        if (error) {
            next(error);
            return;
        }

        next({
            statusCode : 200,
            body : result
        });
    });
}

module.exports = get;

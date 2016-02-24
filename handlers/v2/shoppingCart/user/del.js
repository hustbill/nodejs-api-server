// DELETE /v2/shopping-carts/users/:userId

var async = require('async');
var cacheKey = require('../../../../lib/cacheKey');
var redisHelper = require('../../../../lib/redisHelper');
var mapper = require('../../../../mapper');


/**
 *
 * Delete the shopping cart of user
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function del(request, response, next) {
    var context = request.context,
        logger = context.logger,
        userId = context.user.userId,
        error;

    if (!userId) {
        error = new Error("User id is required.");
        error.errorCode = "InvalidUserId";
        error.statusCode = 400;
        next(error);
        return;
    }

    async.waterfall([
        function (callback) {
            var key = cacheKey.shoppingCartByUserId(userId);
            redisHelper.del(context, key, callback);
        }
    ], function (error) {
        if (error) {
            next(error);
            return;
        }

        next({statusCode : 200});
    });
}

module.exports = del;

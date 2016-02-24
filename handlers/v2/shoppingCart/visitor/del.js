// DELETE /v2/shopping-carts/visitors/:visitorId

var async = require('async');
var cacheKey = require('../../../../lib/cacheKey');
var redisHelper = require('../../../../lib/redisHelper');
var mapper = require('../../../../mapper');


/**
 *
 * Delete the shopping cart of visitor
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function del(request, response, next) {
    var context = request.context,
        logger = context.logger,
        visitorId = request.params.visitorId,
        error;

    if (!visitorId) {
        error = new Error("Visitor id is required.");
        error.errorCode = "InvalidVisitorId";
        error.statusCode = 400;
        next(error);
        return;
    }

    async.waterfall([
        function (callback) {
            var key = cacheKey.shoppingCartByVisitorId(visitorId);
            redisHelper.del(context, key, callback);
        }
    ], function (error, shoppingCart) {
        if (error) {
            next(error);
            return;
        }

        next({statusCode : 200});
    });
}

module.exports = del;

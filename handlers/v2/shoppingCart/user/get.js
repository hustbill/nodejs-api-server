// GET /v2/shopping-carts/users/:userId

var async = require('async');
var cacheKey = require('../../../../lib/cacheKey');
var redisHelper = require('../../../../lib/redisHelper');
var mapper = require('../../../../mapper');
var shoppingCartHelper = require('../../../../lib/shoppingCartHelper');


function generateResponse(shoppingCart) {
    var response = {statusCode: 200};

    response.body = shoppingCart;

    return response;
}

/**
 *
 * Get the shopping cart of user
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        logger = context.logger,
        userId = context.user.userId,
        error;

    async.waterfall([
        // fetch from cache
        function (callback) {
            var key = cacheKey.shoppingCartByUserId(userId);
            redisHelper.get(context, key, callback);
        },
        // check item
        function (shoppingCart, callback) {
            shoppingCartHelper.checkShoppingCart({
                context: context,
                userId: userId,
                shoppingCart: shoppingCart
            }, callback);
        }

    ], function (error, shoppingCart) {
        if (error) {
            next(error);
            return;
        }

        if (!shoppingCart) {
            shoppingCart = {
                id: userId,
                'line-items': []
            };
        }

        next(generateResponse(shoppingCart));
    });
}

module.exports = get;

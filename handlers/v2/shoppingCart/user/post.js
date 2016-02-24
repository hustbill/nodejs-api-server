// POST /v2/shopping-carts/users

var async = require('async');
var cacheKey = require('../../../../lib/cacheKey');
var redisHelper = require('../../../../lib/redisHelper');
var mapper = require('../../../../mapper');
var shoppingCartHelper = require('../../../../lib/shoppingCartHelper');


function getPostData(request) {
    return mapper.parseShoppingCart(request.body);
}

function generateResponse(shoppingCart) {
    var response = {statusCode: 200};

    response.body = shoppingCart;

    return response;
}

/**
 *
 * Set the shopping cart of user
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        postData = getPostData(request),
        userId = context.user.userId,
        error;

    async.waterfall([
        //validate
        function(callback){
            shoppingCartHelper.validateLineItems({
                context: context, 
                lineItems: postData['line-items']
            }, callback);
        },

        // check item
        function (callback) {
            shoppingCartHelper.checkShoppingCart({
                context: context,
                userId: userId,
                shoppingCart: postData
            }, callback);
        },

        // cache
        function (result, callback) {
            var key = cacheKey.shoppingCartByUserId(userId),
                ttl = -1;
            redisHelper.set(context, key, result, ttl, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, result);
            });
        }
    ], function (error, result) {
        if (error) {
            next(error);
            return;
        }

        if (!result) {
            result = {
                id: userId,
                'line-items': []
            };
        }

        next(generateResponse(result));
    });
}

module.exports = post;

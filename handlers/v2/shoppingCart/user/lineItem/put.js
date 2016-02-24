// PUT /v2/shopping-carts/users/:userId/line-items

var async = require('async');
var cacheKey = require('../../../../../lib/cacheKey');
var redisHelper = require('../../../../../lib/redisHelper');
var mapper = require('../../../../../mapper');
var shoppingCartHelper = require('../../../../../lib/shoppingCartHelper');


function getPostData(request) {
    return mapper.parseShoppingCartLineItems(request.body);
}

function generateResponse(lineItems) {
    var response = {statusCode: 200};

    response.body = lineItems;

    return response;
}

/**
 *
 * Set the line items in shopping cart of user
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function put(request, response, next) {
    var context = request.context,
        postData = getPostData(request),
        userId = context.user.userId,
        key,
        error;

    if (!userId) {
        error = new Error("User id is required.");
        error.errorCode = "InvalidUserId";
        error.statusCode = 400;
        next(error);
        return;
    }

    key = cacheKey.shoppingCartByUserId(userId);

    async.waterfall([
        //validate
        function(callback){
            shoppingCartHelper.validateLineItems({
                context: context, 
                lineItems: postData
            }, callback);
        },

        //get from cache
        function (callback) {
            redisHelper.get(context, key, callback);
        },
        //set line-items
        function (shoppingCart, callback) {
            if (!shoppingCart) {
                shoppingCart = {
                    'line-items': postData
                };
            } else {
                shoppingCart['line-items'] = postData;
            }

            callback(null, shoppingCart);
        },
        //check item
        function (shoppingCart, callback) {
            shoppingCartHelper.checkShoppingCart({
                context: context,
                userId: userId,
                shoppingCart: shoppingCart
            }, callback);
        },
        // set into cache
        function (shoppingCart, callback) {
            var ttl = -1;
            redisHelper.set(context, key, shoppingCart, ttl, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, shoppingCart['line-items']);
            });
        }
    ], function (error, lineItems) {
        if (error) {
            next(error);
            return;
        }

        if (!lineItems) {
            lineItems = [];
        }

        next(generateResponse(lineItems));
    });
}

module.exports = put;

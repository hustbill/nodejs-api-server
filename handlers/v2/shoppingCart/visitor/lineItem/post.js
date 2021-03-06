// POST /v2/shopping-carts/visitors/:visitorId/line-items

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
 * Set the line items in shopping cart of visitor
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        postData = getPostData(request),
        visitorId = request.params.visitorId,
        config = context.config,
        key,
        error;

    if (!visitorId) {
        error = new Error("Visitor id is required.");
        error.errorCode = "InvalidVisitorId";
        error.statusCode = 400;
        next(error);
        return;
    }

    key = cacheKey.shoppingCartByVisitorId(visitorId);

    async.waterfall([
        //get from cache
        function (callback) {
            redisHelper.get(context, key, callback);
        },

        //modify lineitems
        function (shoppingCart, callback) {
            if (!shoppingCart) {
                shoppingCart = {
                    'line-items': postData
                };
            } else {
                shoppingCart['line-items'] = shoppingCartHelper.modifyLineItems(shoppingCart['line-items'], postData);
            }

            shoppingCart['line-items'].forEach(function(item){
                if (item.quantity < 0) {
                    item.quantity = 0;
                }
            });

            callback(null, shoppingCart);
        },

        //cache item
        function (shoppingCart, callback) {
            shoppingCartHelper.checkShoppingCart({
                context: context,
                visitorId: visitorId,
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

module.exports = post;

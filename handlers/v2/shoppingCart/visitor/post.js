// POST /v2/shopping-carts/visitors

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
 * Set the shopping cart of visitor
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        postData = getPostData(request),
        visitorId = postData.id,
        roleCode = request.body['role-code'],
        config = context.config,
        error;

    if (!visitorId) {
        error = new Error("Visitor id is required.");
        error.errorCode = "InvalidVisitorId";
        error.statusCode = 400;
        next(error);
        return;
    }

    //
    if(!roleCode && config  && config.application && config.application.shoppingCartSettings) {
        roleCode = config.application.shoppingCartSettings.defaultRoleCode;
    }

    if (!roleCode) {
        error = new Error("role-code is required.");
        error.errorCode = "InvalidRoleCode";
        error.statusCode = 400;
        next(error);
        return;
    }

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
                visitorId: visitorId,
                roleCode: roleCode,
                shoppingCart: postData
            }, callback);
        },

        // cache
        function (result, callback) {
            var key = cacheKey.shoppingCartByVisitorId(visitorId),
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
                id: visitorId,
                'line-items': []
            };
        }

        next(generateResponse(result));
    });
}

module.exports = post;

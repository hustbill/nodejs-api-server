// GET /v2/shopping-carts/visitors/:visitorId

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
 * Get the shopping cart of visitor
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        logger = context.logger,
        visitorId = request.params.visitorId,
        roleCode = request.query['role-code'],
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
        //get from cache
        function (callback) {
            var key = cacheKey.shoppingCartByVisitorId(visitorId);
            redisHelper.get(context, key, callback);
        },
        // check item
        function (shoppingCart, callback) {
            shoppingCartHelper.checkShoppingCart({
                context: context,
                visitorId: visitorId,
                roleCode: roleCode,
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
                id: visitorId,
                'line-items': []
            };
        }

        next(generateResponse(shoppingCart));
    });
}

module.exports = get;

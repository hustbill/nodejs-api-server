// GET /v2/products/order-price-types

var async = require('async');
var catalogName = require('../../../../lib/constants').catalogName;
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');


function generateResponse(orderPriceTypes) {
    var result = {
            statusCode : 200,
            body : mapper.orderPriceTypes(orderPriceTypes)
        };

    return result;
}


/**
 * Return sponsor info json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        productDao = daos.createDao('Product', context);

    async.waterfall([
        function (callback) {
            productDao.getOrderPriceTypes(callback);
        }
    ], function (error, result) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(result));
    });
}

module.exports = get;

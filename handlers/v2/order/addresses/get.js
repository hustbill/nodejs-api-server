// GET /v2/orders/:orderId/addresses

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');


function generateResponse(addresses) {
    var result = {statusCode : 200};

    result.body = {
        billing : mapper.billingAddress(addresses.billingAddress),
        shipping : mapper.shippingAddress(addresses.shippingAddress)
    };

    return result;
}

/**
 *
 * get addresses of order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        orderDao = daos.createDao('Order', context),
        orderId = request.params.orderId,
        error;

    async.waterfall([
        function (callback) {
            orderDao.getAddressesOfOrder(orderId, callback);
        }

    ], function (error, addresses) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(addresses));
    });
}

module.exports = get;

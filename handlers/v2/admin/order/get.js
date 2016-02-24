// GET /v2/admin/orders/:orderId

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');



function generateResponse(order) {
    return {
        statusCode : 200,
        body : mapper.order(order)
    };
}

/**
 *
 * get order info
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
            orderDao.getOrderInfo(orderId, callback);
        }
    ], function (error, order) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(order));
    });
}

module.exports = get;

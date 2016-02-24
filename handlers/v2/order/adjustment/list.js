// GET /v2/orders/:orderId/adjustments

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');


function generateResponse(adjustments) {
    var result = {statusCode : 200};

    result.body = mapper.adjustments(adjustments);

    return result;
}


/**
 *
 * get adjustments of order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        orderDao = daos.createDao('Order', context),
        orderId = parseInt(request.params.orderId, 10),
        error;

    async.waterfall([
        function (callback) {
            orderDao.getAdjustmentsByOrderId(orderId, callback);
        }
    ], function (error, adjustments) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(adjustments));
    });
}

module.exports = get;

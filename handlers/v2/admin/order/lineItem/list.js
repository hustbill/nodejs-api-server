// GET /v2/admin/orders/:orderId/line-items

var async = require('async');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var mapper = require('../../../../../mapper');


function generateResponse(lineItems) {
    var result = {statusCode : 200};

    result.body = mapper.lineItems(lineItems);

    return result;
}


/**
 *
 * list available shipping methods of order
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
            orderDao.getLineItemsByOrderId(orderId, callback);
        }
    ], function (error, lineItems) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(lineItems));
    });
}

module.exports = get;

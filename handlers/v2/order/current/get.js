// GET /v2/orders/current

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var externalServiceMapper = require('../../../../externalServiceMapper');


function generateResponse(orderBatch) {
    var result = {statusCode : 200};

    result.body = externalServiceMapper.orderBatch(orderBatch);

    return result;
}

/**
 *
 * Get all paid orders since last time this API was called.
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        orderDao = daos.createDao('Order', context),
        error;

    async.waterfall([
        function (callback) {
            orderDao.getCurrentPaidOrdersDetailsBatch(callback);
        }

    ], function (error, orderBatch) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(orderBatch));
    });
}

module.exports = get;

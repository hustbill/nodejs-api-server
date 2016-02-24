// POST /v2/admin/orders/:orderId/cancel

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var mapper = require('../../../../../mapper');


function generateResponse(order) {
    return {
        body : mapper.order(order)
    };
}

/**
 *
 * checkout order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        orderId = parseInt(request.params.orderId, 10),
        orderDao = daos.createDao('Order', context),
        error;

    async.waterfall([
        function (callback) {
            orderDao.cancelOrderById(orderId, callback);
        }
    ], function (error, order) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(order));
    });
}

module.exports = post;


// POST /v2/admin/orders/:orderId/refunds

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var mapper = require('../../../../../mapper');


function getPostData(request) {
    var body = request.body,
        postData = {
            label : body.label,
            amount : parseFloat(body.amount) || 0
        };

    return postData;
}


function generateResponse(order) {
    return {
        body : mapper.order(order)
    };
}

/**
 *
 * refund an order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        orderId = parseInt(request.params.orderId, 10),
        orderDao = daos.createDao('Order', context),
        error;

    context.logger.trace("add order adjustment request body: %j", request.body);

    async.waterfall([
        function (callback) {
            var refundOrderOptions = {
                    orderId : orderId
                };
            orderDao.refundOrder(refundOrderOptions, callback);
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


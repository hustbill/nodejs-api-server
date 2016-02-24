// POST /v2/orders/:orderId/payments/:paymentId/captures

var async = require('async');
var daos = require('../../../../../../daos');
var utils = require('../../../../../../lib/utils');
var mapper = require('../../../../../../mapper');


function generateResponse(order) {
    return {
        statusCode : 201,
        body : {
            'order-id' : order.id,
            'order-number' : order.number,
            'order-date' : order.order_date,
            'state' : order.state,
            'payment-state' : order.payment_state,
            'payment-total' : order.payment_total,
            'payment-date' : order.completed_at
        }
    };
}

/**
 *
 * capture a payment of order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        orderDao = daos.createDao('Order', context),
        orderId = parseInt(request.params.orderId, 10),
        paymentId = parseInt(request.params.paymentId, 10),
        error;

    if (!orderId) {
        error = new Error('Order id is invalid.');
        error.errorCode = 'InvalidOrderId';
        error.statusCode = 400;
        next(error);
        return;
    }

    if (!paymentId) {
        error = new Error('Payment id is invalid.');
        error.errorCode = 'InvalidPaymentId';
        error.statusCode = 400;
        next(error);
        return;
    }

    async.waterfall([
        function (callback) {
            var captureOrderPaymentOptions = {
                orderId : orderId,
                paymentId : paymentId
            };
            orderDao.captureOrderPayment(captureOrderPaymentOptions, callback);
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

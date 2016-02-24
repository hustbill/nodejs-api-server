// POST /v2/orders/:orderId/payments

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');


function getPostData(request) {
    var body = request.body,
        data = {};

    data.orderId = request.params.orderId;
    data.paymentMethodId = parseInt(body['payment-method-id'], 10);
    if (body.hasOwnProperty('payment-amount')) {
        data.paymentAmount = parseFloat(body['payment-amount']);
    }

    data.creditcard = mapper.parseCreditcard(body.creditcard);
    data.giftCard = mapper.parseGiftCard(body.giftcard);
    data.specialInstructions = body['special-instructions'];

    return data;
}


function generateResponse(order) {
    return {
        statusCode : 201,
        body : {
            'order-id' : order.id,
            'order-number' : order.number,
            'order-date' : order.order_date,
            'total' : order.total,
            'state' : order.state,
            'payment-state' : order.payment_state,
            'payment-total' : order.payment_total,
            'payment-date' : order.completed_at
        }
    };
}

/**
 *
 * pay an order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        logger = context.logger,
        postData = getPostData(request),
        creditcard = postData.creditcard,
        orderDao = daos.createDao('Order', context),
        error;

    if (creditcard) {
        if (!utils.isValidCreditcardInfo(creditcard)) {
            error = new Error('Invalid credit card info.');
            error.errorCode = 'InvalidCreditcardInfo';
            error.statusCode = 400;

            logger.error('Invalid credit card info. %j', creditcard);
            next(error);
            return;
        }

        if (creditcard.year.length === 2) {
            creditcard.year = (new Date()).getFullYear().toString().substr(0, 2) + creditcard.year;
        }
        if (creditcard.month.length === 1) {
            creditcard.month = '0' + creditcard.month;
        }
    }

    async.waterfall([
        function (callback) {
            orderDao.payOrderById(postData, callback);
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

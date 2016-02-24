// POST /v2/giftcard-orders/:orderId/payments

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');


function getPostData(request) {
    var body = request.body,
        data = {};

    data.creditcard = mapper.parseCreditcard(body.creditcard);

    return data;
}


function generateResponse(order) {
    return {
        statusCode : 200,
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
 * purchase a gift card
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        logger = context.logger,
        payGiftCardOrderOptions = getPostData(request),
        creditcard = payGiftCardOrderOptions.creditcard,
        giftCardDao = daos.createDao('GiftCard', context),
        error;

    logger.trace("purchase gift card request body: %j", request.body);

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
            payGiftCardOrderOptions.userId = context.user.userId;
            payGiftCardOrderOptions.orderId = parseInt(request.params.orderId, 10);
            giftCardDao.payGiftCardOrder(payGiftCardOrderOptions, callback);
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


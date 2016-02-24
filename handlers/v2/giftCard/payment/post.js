// POST /v2/giftcards/:giftcard-code/payments?pin=pin

var daos = require('../../../../daos');
var mapper = require('../../../../mapper');
var async = require('async');

function generateResponse(giftCard) {
    var body = {},
        result = { statusCode : 200, body : body};

    body.amount = giftCard.total;
    body.balance = giftCard.balance;

    return result;
}

/**
 * post by giftcard
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var error,
	context = request.context,
        giftCardDao = daos.createDao('GiftCard', context),
        giftCardPaymentDao = daos.createDao('GiftCardPayment', context),
        payOptions,
        code = request.params.giftCardCode.trim(),
        pin = request.query.pin.trim(),
        amount = request.body.amount,
	orderId = request.body["order-id"];
        
    if (!code) {
        error = new Error('Code is required.');
        error.errorCode = 'InvalidGiftCardCode';
        error.statusCode = 400;
        next(error);
        return;
    }

    if (!pin) {
        error = new Error('Pin is required.');
        error.errorCode = 'InvalidGiftCardPin';
        error.statusCode = 400;
        next(error);
        return;
    }

    if (!amount) {
        error = new Error('amount is required.');
        error.errorCode = 'InvalidAmount';
        error.statusCode = 400;
        next(error);
        return;
    }

    payOptions = {
        code : code,
        pin : pin,
        amount : amount,
        orderId : orderId
    };

    giftCardDao.payByGiftcard(payOptions, function (error, result) {
        if (error) {
            next(error);
            return;
        }
        next(generateResponse(result));
    });
}

module.exports = post;

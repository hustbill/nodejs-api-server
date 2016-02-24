// GET /v2/giftcards?code=<code>&pin=<pin>

var daos = require('../../../daos');
var mapper = require('../../../mapper');
var moment = require('moment');

function generateResponse(giftCard) {
    var body = {},
        result = { statusCode : 200, body : body};

    body.active = giftCard.active;

    body.amount = giftCard.total;
    body.balance = giftCard.balance;

    if (giftCard.expire_at) {
        body["expiration-date"] = moment(giftCard.expire_at).format("YYYY-MM-DD");
    }

    return result;
}

/**
 * get gift card's details
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        giftCardDao = daos.createDao('GiftCard', context),
        code = request.params.giftCardCode.trim(),
        pin = request.query.pin.trim(),
        error;

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

    giftCardDao.getGiftCardByCodeAndPin(code, pin, function (error, giftCard) {
        if (error) {
            next(error);
            return;
        }

        if (!giftCard) {
            error = new Error("Gift card with code '" + code + "' does not exist.");
            error.errorCode = 'GiftCardNotFound.';
            error.statusCode = 400;
            next(error);
            return;
        }

        next(generateResponse(giftCard));
    });
}

module.exports = get;

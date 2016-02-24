// GET /v2/giftcards

var daos = require('../../../daos');
var mapper = require('../../../mapper');
var moment = require('moment');

function generateResponse(giftCards) {
    var result = { statusCode : 200};


    result.body = giftCards.map(function (giftCard) {
        var data = {
            code : giftCard.code,
            pin : giftCard.pin,
            'order-id' : giftCard.order_id,
            'recipient-email' : giftCard.recipient_email,
            amount : giftCard.total,
            balance : giftCard.balance,
            'purchase-date' : moment(giftCard.created_at).format('YYYY-MM-DD')
        };

        return data;
    });

    return result;
}

/**
 * list all gift cards bought by current user.
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        giftCardDao = daos.createDao('GiftCard', context),
        getGiftCardsOptions = {},
        error;


    getGiftCardsOptions = {
        userId : context.user.userId
    };
    giftCardDao.getGiftCardsByUserId(getGiftCardsOptions, function (error, giftCards) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(giftCards));
    });
}

module.exports = get;

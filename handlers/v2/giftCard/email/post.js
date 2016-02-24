// GET /v2/giftcards/:giftCardCode/emails

var daos = require('../../../../daos');


/**
 * send gift card email
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        giftCardDao = daos.createDao('GiftCard', context),
        code = request.params.giftCardCode,
        error;

    if (!code) {
        error = new Error('Code is required.');
        error.errorCode = 'InvalidGiftCardCode';
        error.statusCode = 400;
        next(error);
        return;
    }

    giftCardDao.sendGiftCardEmailByCode(code, function (error, giftCard) {
        if (error) {
            next(error);
            return;
        }

        next({
            statusCode : 200,
            body : {
                success : true,
                'recipient-email' : giftCard.recipient_email
            }
        });
    });
}

module.exports = post;

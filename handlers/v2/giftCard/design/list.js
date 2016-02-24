// GET /v2/giftcards/designs

var daos = require('../../../../daos');
var mapper = require('../../../../mapper');

function generateResponse(giftCardDesigns) {
    var result = { statusCode : 200 };

    result.body = mapper.giftCardDesigns(giftCardDesigns);

    return result;
}

/**
 * get gift card designs list
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context,
        giftCardDesignDao = daos.createDao('GiftCardDesign', context),
        error;

    giftCardDesignDao.getGiftCardDesigns(function (error, giftCardDesigns) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(giftCardDesigns));
    });
}

module.exports = list;

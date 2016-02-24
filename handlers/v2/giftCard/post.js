// POST /v2/giftcards

var async = require('async');
var u = require('underscore');
var daos = require('../../../daos');
var utils = require('../../../lib/utils');
var mapper = require('../../../mapper');


function parseEmailInfo(data) {
    if (!data) {
        return null;
    }

    var emailInfo = {
            message : data.message,
            nameFrom : data['name-from'],
            nameTo : data['name-to'],
            recipientEmail : data['recipient-email']
        };

    return emailInfo;
}

function parseMailingInfo(data) {
    if (!data) {
        return null;
    }

    var mailingInfo = mapper.parseShippingAddress(data);
    mailingInfo.message = data.message;

    return mailingInfo;
}

function parseGiftCard(data) {
    return {
        variantId : parseInt(data['variant-id'], 10),
        quantity : parseInt(data.quantity, 10),
        emailInfo : parseEmailInfo(data['email-info']),
        mailingInfo : parseMailingInfo(data['mailing-info'])
    };
}

function parseGiftCards(data) {
    if (!data) {
        return null;
    }

    return data.map(parseGiftCard);
}

function getPostData(request) {
    var body = request.body,
        data = {};

    data.giftCards = parseGiftCards(body.giftcards);
    data.creditcard = mapper.parseCreditcard(body.creditcard);

    if (body['optional-fields'] && body['optional-fields']['event-code']) {
        data.eventCode = body['optional-fields']['event-code'];
    }

    return data;
}


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
 * purchase a gift card
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        logger = context.logger,
        purchaseGiftCardsOptions = getPostData(request),
        creditcard = purchaseGiftCardsOptions.creditcard,
        emailInfo = purchaseGiftCardsOptions.emailInfo,
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

    if (emailInfo) {
        if (!utils.isValidEmail(emailInfo.recipientEmail)) {
            error = new Error('Invalid recipient email.');
            error.errorCode = 'InvalidRecipientEmail';
            error.statusCode = 400;
            next(error);
            return;
        }
    }

    async.waterfall([
        function (callback) {
            purchaseGiftCardsOptions.userId = context.user.userId;
            giftCardDao.purchaseGiftCards(purchaseGiftCardsOptions, callback);
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


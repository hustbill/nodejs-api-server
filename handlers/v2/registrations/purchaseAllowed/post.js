// POST /v2/orders/purchase-allowed

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var fraudPrevention = require('../../../../lib/fraudPrevention');
var mapper = require('../../../../mapper');


function getPostData(request) {
    var body = request.body,
        data = {
            countryIso : body['country-iso'],
            orderAmount : parseFloat(body['order-amount']),
            creditcardNumber : body['creditcard-number']
        };
    return data;
}

function checkPostData(postData, callback) {
    var error;

    if (!postData.countryIso) {
        error = new Error('Country ISO is required.');
        error.errorCode = 'InvalidCountryIso';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!postData.orderAmount) {
        error = new Error('Order amount is required.');
        error.errorCode = 'InvalidOrderAmount';
        error.statusCode = 400;
        callback(error);
        return;
    }
}

function generateResponse(isAllowed) {
    var result = {
            statusCode : 200,
            body : {
                allowed : isAllowed
            }
        };

    return result;
}

/**
 *
 * update shipping info of order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        creditcardDao = daos.createDao('Creditcard', context),
        postData = getPostData(request),
        error;

    async.waterfall([
        function (callback) {
            checkPostData(postData, callback);
        },

        function (callback) {
            fraudPrevention.isPurchaseAllowedForRegistration(context, {
                orderAmount : postData.orderAmount,
                countryIso : postData.countryIso
            }, function (error, isAllowed) {
                if (error) {
                    callback(error);
                    return;
                }

                if (isAllowed) {
                    callback();
                    return;
                }

                // not allowed
                next(generateResponse(isAllowed));
            });
        },

        function (callback) {
            if (!postData.creditcardNumber) {
                callback(null, true);
                return;
            }

            creditcardDao.isCreditcardAllowedForRegistration(postData.creditcardNumber, callback);
        }

    ], function (error, isAllowed) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(isAllowed));
    });
}

module.exports = post;

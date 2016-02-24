// POST /v2/orders/purchase-allowed

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var fraudPrevention = require('../../../../lib/fraudPrevention');
var mapper = require('../../../../mapper');


function getPostData(request) {
    var body = request.body,
        data = {
            userLogin : body['user-login'],
            countryIso : body['country-iso'],
            orderAmount : parseFloat(body['order-amount']),
            creditcardNumber : body['creditcard-number']
        };
    return data;
}

function checkPostData(postData, callback) {
    var error;

    if (!postData.userLogin) {
        error = new Error('User login in required.');
        error.errorCode = 'InvalidUserLogin';
        error.statusCode = 400;
        callback(error);
        return;
    }

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
        postData = getPostData(request),
        error;

    async.waterfall([
        function (callback) {
            fraudPrevention.isPurchaseAllowed(context, postData, callback);
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

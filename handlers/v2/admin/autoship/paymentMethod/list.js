// GET /v2/admin/autoships/payment-methods

var async = require('async');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var mapper = require('../../../../../mapper');


function generateResponse(paymentMethods) {
    var result = {statusCode : 200};

    result.body = mapper.paymentMethods(paymentMethods);

    return result;
}


/**
 *
 * list available payment methods for autoship order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        orderDao = daos.createDao('Order', context),
        countryId = parseInt(request.query['country-id'], 10),
        error;

    async.waterfall([
        function (callback) {
            orderDao.getAvailableAutoshipPaymentMethodsByCountryId(countryId, callback);
        }
    ], function (error, paymentMethods) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(paymentMethods));
    });
}

module.exports = get;

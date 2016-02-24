// GET /v2/autoships/shipping-methods

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');




/**
 *
 * list available shipping methods for autoship order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        orderDao = daos.createDao('Order', context),
        countryId = parseInt(request.query['country-id'], 10),
        stateId = parseInt(request.query['state-id'], 10),
        error;

    async.waterfall([
        function (callback) {
            orderDao.getAvailableShippingMethodsByCountryIdAndStateId(countryId, stateId, callback);
        }
    ], function (error, shippingMethods) {
        if (error) {
            next(error);
            return;
        }

        next({
            statusCode : 200,
            body : mapper.shippingMethods(shippingMethods)
        });
    });
}

module.exports = get;

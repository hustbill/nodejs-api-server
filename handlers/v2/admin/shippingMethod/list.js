// GET /v2/admin/shipping-methods

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');


function parseVariantIds(data) {
    if (!data) {
        return [];
    }

    var variantIds = [],
        strVariantIds = data.split(',');

    strVariantIds.forEach(function (strVariantId) {
        var variantId = parseInt(strVariantId.trim(), 10);
        if (variantId) {
            variantIds.push(variantId);
        }
    });

    return variantIds;
}


/**
 *
 * list available shipping methods of order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        orderDao = daos.createDao('Order', context),
        countryId = parseInt(request.query['country-id'], 10),
        stateId = parseInt(request.query['state-id'], 10),
        variantIds = parseVariantIds(request.query['variant-ids']),
        error;

    async.waterfall([
        function (callback) {
            if (!variantIds.length) {
                orderDao.getAvailableShippingMethodsByCountryIdAndStateId(countryId, stateId, callback);
                return;
            }

            var variantDao = daos.createDao('Variant', context);
            variantDao.isAllVariantsNoShippingByIds(variantIds, function (error, isNoShipping) {
                if (error) {
                    callback(error);
                    return;
                }

                if (isNoShipping) {
                    callback(null, []);
                    return;
                }

                orderDao.getAvailableShippingMethodsByCountryIdAndStateId(countryId, stateId, callback);
            });
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

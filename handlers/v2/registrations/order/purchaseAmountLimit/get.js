// GET /v2/registrations/orders/purchase-amount-limit

var async = require('async');
var daos = require('../../../../../daos');
var fraudPrevention = require('../../../../../lib/fraudPrevention');


/**
 *
 * Get first time purchase amount limit
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        countryId = parseInt(request.query['country-id'], 10),
        countryDao = daos.createDao('Country', context);

    async.waterfall([
        function (callback) {
            countryDao.getCountryById(countryId, callback);
        },

        function (country, callback) {
            if (!country) {
                var error = new Error("Country with id " + countryId + " was not found.");
                error.statusCode = 404;
                callback(error);
                return;
            }
            fraudPrevention.getFirstTimeOrderLimit(country.iso, callback);
        }
    ], function (error, limitAmount) {
        if (error) {
            next(error);
            return;
        }

        next({
            statusCode : 200,
            body : {
                limit : limitAmount
            }
        });
    });
}

module.exports = get;


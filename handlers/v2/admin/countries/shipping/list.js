/**
 * GET /v2/admin/countries/shipping?home-country-id=id
 */

var async = require('async');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var mapper = require('../../../../../mapper');


function generateResult(countries) {
    return {
        statusCode : 200,
        body : mapper.countries(countries)
    };
}

/**
 *
 * Get available shipping countries and states.
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context,
        homeCountryId = parseInt(request.query['home-country-id'], 10),
        error;

    if (!homeCountryId) {
        error = new Error("Parameter 'home-country-id' can not be empty.");
        error.statusCode = 400;
        next(error);
        return;
    }

    async.waterfall([
        function (callback) {
            var countryDao = daos.createDao('Country', context);
            countryDao.getCanShipCountriesByCountryId(homeCountryId, callback);
        }

    ], function (error, countries) {
        if (error) {
            next(error);
            return;
        }

        next(generateResult(countries));
    });
}

module.exports = list;

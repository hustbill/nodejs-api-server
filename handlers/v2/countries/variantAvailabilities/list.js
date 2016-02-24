// GET /v2/countries/:countryISO/variant-availabilities?variant-ids=<variant-ids>
var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');

function parseVariantIds(request) {
    var input = request.query['variant-ids'],
        splittedValues,
        result;

    if (!input) {
        return null;
    }

    splittedValues = input.split(',');
    result = [];
    splittedValues.forEach(function (splittedValue) {
        result.push(parseInt(splittedValue, 10) || 0);
    });

    return result;
}

function generateResult(availabilities) {
    return {
        statusCode : 200,
        body : availabilities
    };
}

/**
 *
 * Get All countries that current user can ship to
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context,
        countryISO = request.params.countryISO,
        variantIds = parseVariantIds(request),
        variantDao = daos.createDao('Variant', context),
        error;

    async.waterfall([
        function (callback) {
            var countryDao = daos.createDao('Country', context);
            countryDao.getCountryByIso(countryISO, callback);
        },

        function (country, callback) {
            if (!country) {
                error = new Error("Country with ISO '" + countryISO + "' was not found.");
                error.errorCode = 'InvalidCountryISO';
                error.statusCode = 404;
                callback(error);
                return;
            }

            variantDao.getVariantsAvailabilitiesInCountry(variantIds, country.id, callback);
        }

    ], function (error, availabilities) {
        if (error) {
            next(error);
            return;
        }

        next(generateResult(availabilities));
    });
}

module.exports = list;

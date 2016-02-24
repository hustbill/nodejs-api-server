// GET /v2/localizations

var async = require('async'),
    daos = require('../../../daos'),
    utils = require('../../../lib/utils');

/**
 * Load localization related info based on home address
 *
 * @method loadAddressHome
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function getIsoAndSymbolByCountryId(request, callback) {
    var context = request.context,
        addressDao = daos.createDao('Address', context),
        countryId = request.query['country-id'];

    if (!countryId) {
        var error = new Error("country-id is required.");
        error.errorCode = 'InvalidCountryId';
        error.statusCode = 400;
        callback(error);
        return;
    }

    addressDao.getIsoAndSymbol(
        countryId,
        function (error, result) {
            if (error) {
                callback(error);
                return;
            }
            context.result = result;
            callback(null);
        }
    );
}

/**
 * convert the database result rows into response object.
 *
 * @method generateResponse
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function generateResponse(request, callback) {
    var context = request.context,
        result = { statusCode : 200},
        row;

    if (!context.result.rows || context.result.rows.length === 0) {
        var error = new Error("Invalid CountryId");
        error.errorCode = 'InvalidCountryId';
        error.statusCode = 400;
        callback(error);
        return;
    }
    row = context.result.rows[0];



    result.body = {
        'currency-symbol': row.symbol,
        'country-iso': row.iso
    };

    callback(result);
}

/**
 * Return localization related info json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    async.series([
        function (callback) {
            getIsoAndSymbolByCountryId(request, callback);
        },
        function (callback) {
            generateResponse(request, callback);
        }
    ], next);
}

module.exports = get;

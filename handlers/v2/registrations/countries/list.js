/**
 * Get countries that can register
 */

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');


function getCanRegisterCountries(context, callback) {
    var countryDao = daos.createDao('Country', context);

    countryDao.getAllCountriesAndStates(callback);
}

function generateResult(countries) {
    return {
        statusCode : 200,
        body : mapper.countries(countries)
    };
}

/**
 *
 * Get countries that can register.
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context,
        error;

    async.waterfall([
        function (callback) {
            getCanRegisterCountries(context, callback);
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

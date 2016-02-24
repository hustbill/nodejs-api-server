/**
 * Get All client actived countries
 */

var async = require('async');
var daos = require('../../../daos');
var utils = require('../../../lib/utils');
var mapper = require('../../../mapper');


function generateResult(countries) {
    return {
        statusCode : 200,
        body : mapper.countries(countries)
    };
}

/**
 *
 * Get All client actived countries
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context,
        countryDao = daos.createDao('Country', context),
        error;

    async.waterfall([
        function (callback) {
            countryDao.getAllCountriesAndStates(callback);
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

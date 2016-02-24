// GET /v2/sponsor

var async = require('async'),
    daos = require('../../../daos'),
    utils = require('../../../lib/utils');

/**
 * Load sponsor info
 *
 * @method loadSponsor
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function loadSponsor(request, callback) {
    var context = request.context,
        distributorDao = daos.createDao('Distributor', context),
        distributorId = context.user.distributorId;

    distributorDao.getSponsor(
        distributorId,
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
        row = context.result.rows[0],
        result = { statusCode : 200};

    result.body = {
        id: row.distributor_id,
        name: row.distributor_name,
        'next-renewal-date': row.next_renewal_date
    };

    callback(result);
}

/**
 * Return sponsor info json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    async.series([
        function (callback) {
            loadSponsor(request, callback);
        },
        function (callback) {
            generateResponse(request, callback);
        }
    ], next);
}

module.exports = get;

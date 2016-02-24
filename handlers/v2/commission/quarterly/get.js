// GET /v2/commissions/quarterly?year=year&quarter=quarter

var async = require('async');
var daos = require('../../../../daos');
var rankMap = require('../../../../lib/constants').rankMap;
var utils = require('../../../../lib/utils');


/**
 * convert the database result rows into response object.
 *
 * @method generateResponse
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function generateResponse(rows) {
    var result = { statusCode : 200, body : [] };

    rows.forEach(function (row) {
        result.body.push({
            'pool-type' : rankMap(row.pool_type, 0),
            'global-pool-share' : row.global_pool_share,
            'amount-global' : row.amount_global,
            'amount-local' : parseFloat((row.amount_global * row.fx_rate).toFixed(2))
        });
    });

    return result;
}

/**
 * Return quarterly commission json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        commissionDao = daos.createDao('Commission', context),
        distributorId = context.user.distributorId,
        error,
        quarter = request.query.quarter,
        responseResult,
        year = request.query.year;

    if (isNaN(year)) {
        error = new Error('Invalid year: ' + year);
        error.statusCode = 400;
        next(error);
        return;
    }

    if (isNaN(quarter) || ([1, 2, 3, 4].indexOf === -1)) {
        error = new Error('Invalid quarter: ' + quarter);
        error.statusCode = 400;
        next(error);
        return;
    }

    quarter = parseInt(quarter, 10);
    year = parseInt(year, 10);

    async.series([
        function (callback) {
            commissionDao.isValidQuarterlyDate(quarter, year, callback);
        },
        function (callback) {
            commissionDao.getQuarterlyCommission(
                distributorId,
                year,
                quarter,
                function (error, result) {
                    if (error) {
                        callback(error);
                        return;
                    }
                    try {
                        responseResult = generateResponse(result.rows);
                    } catch (exception) {
                        callback(exception);
                    }
                    callback(responseResult);
                }
            );
        }
    ], next);
}

module.exports = get;

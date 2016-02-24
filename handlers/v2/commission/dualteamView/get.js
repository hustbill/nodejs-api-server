// GET /v2/commissions/dualteam-views?date=monthly-date

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
        if (row.current_rank && row.paid_rank) {
            result.body.push(
                {
                    'distributor-id' : row.distributor_id,
                    'distributor-name' : row.distributor_name,
                    'dualteam-current-position' : row.dualteam_current_position,
                    pvq: row.pvq,
                    'current-pvq' : row.curr_pvq,
                    'current-rank' : rankMap(row.current_rank_id, 0),
                    'paid-rank' : rankMap(row.paid_rank_id, 0),
                    active: row.active
                }
            );
        }
    });

    return result;
}

/**
 * Return commission dualteam view json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        date = request.query.date,
        commissionDao = daos.createDao('Commission', context),
        distributorId = context.user.distributorId,
        responseResult;

    async.series([
        function (callback) {
            commissionDao.isValidMonthlyDate(date, callback);
        },
        function (callback) {
            commissionDao.getDualteamView(
                distributorId,
                date,
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

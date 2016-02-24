// GET /v2/reports/growth?date=monthly-date

var async = require('async');
var daos = require('../../../../daos');
var rankMap = require('../../../../lib/constants').rankMap;
var utils = require('../../../../lib/utils');

/**
 * convert the database result rows into response object.
 *
 * @method generateResponse
 * @param rows {Request} database records.
 */
function generateResponse(rows) {
    var result = { statusCode : 200, body : []};

    rows.forEach(function (row) {
        result.body.push(
            {
                level: row.level,
                rank: rankMap(row.rank_id, 0),
                'current-month' : row.current_month,
                'prior-month' : row.prior_month,
                'two-month-ago' : row.two_month_ago
            }
        );
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
        commissionDao = daos.createDao('Commission', context),
        reportDao = daos.createDao('Report', context),
        distributorId = context.user.distributorId,
        date = request.query.date || utils.getFirstDayOfMonth(),
        responseResult;

    async.series([
        function (callback) {
            commissionDao.isValidMonthlyDate(date, callback);
        },
        function (callback) {
            reportDao.getGrowth(
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

// GET /v2/reports/summaries?date=monthly-date

var async = require('async');
var daos = require('../../../../daos');

/**
 * convert the database result rows into response object.
 *
 * @method generateResponse
 * @param row {Request} database record.
 */
function generateResponse(row) {
    if (!row) {
        return {statusCode : 200, body: {}};
    }

    var result = { statusCode : 200};

    result.body = {
        'downline-summary' : {
            'total-members' : row.total_members,
            'active-members' : row.active_members,
            'new-last-month' : row.last_month_new,
            'new-this-month' : row.this_month_new
        },
        'volume-summary' : {
            'group-volume-last-bonus-run' : row.group_volume_last_bonus_run,
            'personal-volume-last-bonus-run' : row.personal_volume_last_bonus_run,
            'group-volume-current-period' : row.group_volume_current_period,
            'personal-volume-current-period' : row.personal_volume_current_period
        }
    };

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
        date = request.query.date,
        responseResult;

    async.series([
        function (callback) {
            commissionDao.isValidMonthlyDate(date, callback);
        },
        function (callback) {
            reportDao.getSummaries(
                distributorId,
                date,
                function (error, result) {
                    if (error) {
                        callback(error);
                        return;
                    }
                    try {
                        responseResult = generateResponse(result.rows[0]);
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

//GET /v2/reports/organizations/counts/dualteam?date=weekly-date[&orders_only=1]

var async = require('async');
var daos = require('../../../../../../daos');
var utils = require('../../../../../../lib/utils');

/**
 * Validate the date.
 *
 * @method validateDate
 * @param context {Object} request's context object.
 * @param callback {Function} callback function.
 */
function validateDate(context, callback) {
    context.commissionDao.isValidWeeklyDate(context.input.date, callback);
}

/**
 * @param context {Object} request's context object.
 * @param next {Function} express next function.
 */
function generateResponse(context, callback) {
    var reportDao = context.reportDao,
        input = context.input,
        distributorId = context.user.distributorId,
        date = input.date,
        orders_only = input.orders_only,
        responseResult = {body: {}};

    reportDao.getOrganizationDualteamCount(
        distributorId,
        date,
        orders_only,
        function (error, result) {
            if (error) {
                callback(error);
                return;
            }

            if (!result.rows.length) {
                responseResult.body.count = 0;
            } else {
                responseResult.body.count = result.rows[0].count;
            }
            callback(responseResult);
        }
    );
}

/**
 * Return dualteam commission counts json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        query = request.query;

    context.commissionDao = daos.createDao('Commission', context);
    context.reportDao = daos.createDao('Report', context);

    context.input = {
        date: query.date,
        orders_only: query.orders_only
    };

    async.series([
        function (callback) {
            validateDate(context, callback);
        },
        function (callback) {
            generateResponse(context, callback);
        }
    ], next);
}

module.exports = get;

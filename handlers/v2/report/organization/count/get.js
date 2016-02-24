// GET /v2/reports/organizations/counts?date=monthly-date[&orders_only=1&types=dualteam,unilevel]

var async = require('async');
var common = require('../common');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');

/**
 * Validate the request.
 *
 * @method validateRequest
 * @param context {Object} request's context object.
 * @param callback {Function} callback function.
 */
function validateRequest(context, callback) {
    var error;

    common.setOrganizationTypes(context);
    error = common.validateOrganizationTypes(context);
    if (error) {
        callback(error);
        return;
    }

    context.commissionDao.isValidMonthlyDate(context.input.date, callback);
}

function generateSingleResponse(retrieve, organizationType, action, responseResult, callback) {
    if (retrieve) {
        action(
            function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }
                if (!result.rows.length) {
                    responseResult.body[organizationType] = 0;
                } else {
                    responseResult.body[organizationType] = result.rows[0].count;
                }
                callback(null);
            }
        );
    } else {
        callback(null);
    }
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

    async.parallel([
        function (next) {
            generateSingleResponse(
                input.dualteam,
                'dualteam-count',
                reportDao.getOrganizationDualteamCount.bind(reportDao, distributorId, date, orders_only),
                responseResult,
                next
            );
        },
        function (next) {
            generateSingleResponse(
                input.unilevel,
                'unilevel-count',
                reportDao.getOrganizationUnilevelCount.bind(reportDao, distributorId, date, orders_only),
                responseResult,
                next
            );
        }
    ],	function (error, result) {
        if (error) {
            callback(error);
            return;
        }
        callback(responseResult);
    });
}

/**
 * Return monthly commission counts json
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
        orders_only: query.orders_only,
        types: query.types,
        dualteam: true,
        unilevel: true
    };

    async.series([
        function (callback) {
            validateRequest(context, callback);
        },
        function (callback) {
            generateResponse(context, callback);
        }
    ], next);
}

module.exports = get;

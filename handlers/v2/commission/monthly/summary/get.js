// GET /v2/commissions/monthly/summaries?date=monthly-date[&types=unilevel,unilevel-match,generation]

var async = require('async');
var common = require('../common');
var	daos = require('../../../../../daos');
var	utils = require('../../../../../lib/utils');

/**
 * Validate the request.
 *
 * @method validateRequest
 * @param context {Object} request's context object.
 * @param callback {Function} callback function.
 */
function validateRequest(context, callback) {
    var error;

    common.setCommissionTypes(context);
    error = common.validateCommissionTypes(context);
    if (error) {
        callback(error);
        return;
    }

    context.commissionDao.isValidMonthlyDate(context.input.date, callback);
}

/**
 * return result JSON
 *
 * @method getResult
 * @param rows {Object}
 */
function getResult(rows) {
    var result = [];

    rows.forEach(
        function (row) {
            result.push(
                {
                    'country-iso' : row.country_iso,
                    bonus : parseFloat((row.bonus_total * row.exchange_rate).toFixed(2)),
                    'bonus-local' : parseFloat((row.bonus_total * row.exchange_rate).toFixed(2)),
                    'bonus-global' : row.bonus_total,
                    'paid-level' : row.paid_level,
                    'sponsored-level' : row.sponsored_level,
                    'children-total': row.child_total
                }
            );
        }
    );
    return result;
}

function generateSingleResponse(retrieve, commissionType, action, responseResult, callback) {
    if (retrieve) {
        action(
            function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }
                try {
                    responseResult.body[commissionType] = getResult(result.rows);
                    callback(null);
                } catch (exception) {
                    callback(exception);
                }
            }
        );
    } else {
        callback(null);
    }
}

/**
 * Return monthly commission json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function generateResponse(context, callback) {
    var commissionDao = context.commissionDao,
        date = context.input.date,
        distributorId = context.user.distributorId,
        input = context.input,
        responseResult = {body: {}};

    async.parallel([
        function (next) {
            generateSingleResponse(
                input.unilevel,
                'unilevel',
                commissionDao.getMonthlyUnilevelCommissionSummary.bind(commissionDao, distributorId, date),
                responseResult,
                next
            );
        },
        function (next) {
            generateSingleResponse(
                input.unilevelMatch,
                'unilevel-match',
                commissionDao.getMonthlyUnilevelMatchCommissionSummary.bind(commissionDao,  distributorId, date),
                responseResult,
                next
            );
        },
        function (next) {
            generateSingleResponse(
                input.generation,
                'generation',
                commissionDao.getMonthlyGenerationCommissionSummary.bind(commissionDao,  distributorId, date),
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
 * Return monthly commission json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        query = request.query;

    context.commissionDao = daos.createDao('Commission', context);

    context.input = {
        date: query.date,
        types: query.types,
        generation: true,
        unilevel: true,
        unilevelMatch: true
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

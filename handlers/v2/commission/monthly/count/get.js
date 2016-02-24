// GET /v2/commissions/monthly/counts?date=monthly-date[&types=unilevel,unilevel-match,generation]

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

    common.setCommissionTypes(context);
    error = common.validateCommissionTypes(context);
    if (error) {
        callback(error);
        return;
    }

    context.commissionDao.isValidMonthlyDate(context.input.date, callback);
}

function generateSingleResponse(retrieve, commissionType, action, responseResult, callback) {
    if (retrieve) {
        action(
            function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }
                if (!result.rows.length) {
                    responseResult.body[commissionType] = 0;
                } else {
                    responseResult.body[commissionType] = result.rows[0].count;
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
    var commissionDao = context.commissionDao,
        input = context.input,
        distributorId = context.user.distributorId,
        date = input.date,
        responseResult = {body: {}};

    async.parallel([
        function (next) {
            generateSingleResponse(
                input.unilevel,
                'unilevel-count',
                commissionDao.getMonthlyUnilevelCommissionCount.bind(commissionDao, distributorId, date),
                responseResult,
                next
            );
        },
        function (next) {
            generateSingleResponse(
                input.unilevelMatch,
                'unilevel-match-count',
                commissionDao.getMonthlyUnilevelMatchCommissionCount.bind(commissionDao, distributorId, date),
                responseResult,
                next
            );
        },
        function (next) {
            generateSingleResponse(
                input.generation,
                'generation-count',
                commissionDao.getMonthlyGenerationCommissionCount.bind(commissionDao, distributorId, date),
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

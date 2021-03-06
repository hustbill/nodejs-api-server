// GET /v2/reports/organization?date=monthly-date[&offset=<offset>&limit=<limit>&orders_only=1&types=dualteam,unilevel]

var async = require('async');
var common = require('./common');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');

/**
 * Validate the request.
 *
 * @method validateRequest
 * @param context {Object} request's context object.
 * @param callback {Function} callback function.
 */
function validateRequest(context, callback) {
    var commissionDao = context.commissionDao,
        error,
        input = context.input;

    if (isNaN(input.offset)) {
        input.offset = 0;
    } else {
        input.offset = parseInt(input.offset, 10);
    }

    if (isNaN(input.limit)) {
        input.limit = 25;
    } else {
        input.limit = parseInt(input.limit, 10);
    }

    common.setOrganizationTypes(context);
    error = common.validateOrganizationTypes(context);
    if (error) {
        callback(error);
        return;
    }

    commissionDao.isValidMonthlyDate(input.date, callback);
}

function setReporsOrganizationOrderInfo(result, orderInfo) {
    var orderArray,
        singleOrderInfoArray;

    result['qualification-volume'] = 0;
    result['dualteam-volume'] = 0;
    result['unilevel-volume'] = 0;
    result['fast-track-volume'] = 0;

    if ((orderInfo === '') || (orderInfo === null)) {
        result['order-count'] = 0;
        return;
    }

    orderArray = orderInfo.split(':');
    result['order-count'] = orderArray.length;

    orderArray.forEach(function (order) {
        singleOrderInfoArray = order.split(',');

        result['qualification-volume'] += parseFloat(singleOrderInfoArray[1]);
        result['dualteam-volume'] += parseFloat(singleOrderInfoArray[3]);
        result['unilevel-volume'] += parseFloat(singleOrderInfoArray[4]);
        result['fast-track-volume'] += parseFloat(singleOrderInfoArray[5]);
    });
}

/**
 * return result JSON
 *
 * @method getResult
 * @param rows {Object}
 */
function getResult(rows) {
    var hash,
        result = [];

    rows.forEach(
        function (row) {
            hash = {
                'distributor-id' : row.distributor_id,
                'distributor-name': row.full_name,
                level: row.child_level,
                rank: row.rank_name,
                'country-iso': row.country_name,
                state: row.state_name,
                'dt-side': row.dt_side
            };
            setReporsOrganizationOrderInfo(hash, row.order_info);
            result.push(hash);
        }
    );
    return result;
}

function generateSingleResponse(retrieve, organizationType, action, responseResult, callback) {
    if (retrieve) {
        action(
            function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }
                try {
                    responseResult.body[organizationType] = getResult(result.rows);
                } catch (exception) {
                    callback(exception);
                    return;
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
        responseResult = {body: {}};

    async.parallel([
        function (next) {
            generateSingleResponse(
                context.input.dualteam,
                'dualteam',
                reportDao.getOrganizationDualteam.bind(reportDao, context),
                responseResult,
                next
            );
        },
        function (next) {
            generateSingleResponse(
                context.input.unilevel,
                'unilevel',
                reportDao.getOrganizationUnilevel.bind(reportDao, context),
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
 * Return report organization json
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
        limit: query.limit,
        offset: query.offset,
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

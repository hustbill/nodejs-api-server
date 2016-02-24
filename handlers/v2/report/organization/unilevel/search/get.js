// GET /v2/reports/organizations/unilevel/:child-distributor-id?date=weekly-date[&orders_only=1]

var async = require('async');
var daos = require('../../../../../../daos');
var utils = require('../../../../../../lib/utils');

/**
 * Validate the request.
 *
 * @method validateRequest
 * @param context {Object} request's context object.
 * @param callback {Function} callback function.
 */
function validateRequest(context, callback) {
    var commissionDao = context.commissionDao,
        input = context.input,
        error;

    if (parseInt(input.child_distributor_id, 10).toString() !== input.child_distributor_id) {
        error = new Error('Invalid distributor ID: ' + input.child_distributor_id);
        error.statusCode = 400;
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
function getResult(data) {
    if (!data) {
        return {};
    }

    var result;

    result = {
        'distributor-id' : data.distributor_id,
        'distributor-name': data.full_name,
        level: data.child_level,
        rank: data.rank_name,
        'country-iso': data.country_name,
        'role-code' : data.role_code,
        state: data.state_name,
        'dt-side': data.dt_side,
	'group-volume' : data.group_volume || 0,
	'personal-sale' : data.personal_sales || 0,
	'personal-volume' : data.personal_volume || 0,
	'team-volume' : data.team_volume || 0
    };
    setReporsOrganizationOrderInfo(result, data.order_info);

    return result;
}

/**
 * @param context {Object} request's context object.
 * @param next {Function} express next function.
 */
function generateResponse(context, callback) {
    var reportDao = context.reportDao,
        responseResult = {};

    reportDao.getSingleOrganizationUnilevel(
        context,
        function (error, result) {
            if (error) {
                callback(error);
                return;
            }

			if (result.rows.length === 0) {
				callback({body: {}});
				return;
			}
            try {
                responseResult.body = getResult(result.rows[0]);
            } catch (exception) {
                callback(exception);
                return;
            }
            callback(responseResult);
        }
    );
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
		child_distributor_id: request.params.id,
        orders_only: query.orders_only
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

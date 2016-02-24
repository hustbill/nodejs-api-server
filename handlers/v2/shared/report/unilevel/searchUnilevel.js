// GET /v2/reports/organizations/unilevel/:child-distributor-id?date=weekly-date[&orders_only=1]

var async = require('async');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var common = require('../common');

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
                responseResult.body = common.getSingResult(result.rows[0]);
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
function searchUnilevel(context, callback) {

    async.series([
        function (callback) {
            validateRequest(context, callback);
        },
        function (callback) {
            generateResponse(context, callback);
        }
    ], callback);
}

module.exports = searchUnilevel;

// GET /v2/genealogy/unilevel/path?from=child-distributor-id

var async = require('async');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');

/**
 * Validate the request.
 *
 * @method validateRequest
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function validateRequest(request, callback) {
    var childDistributorId = request.query.from,
        customError;

    if (childDistributorId === undefined) {
        customError = new Error("Missing search distributor Id.");
        customError.statusCode = 400;
        callback(customError);
        return;
    }

    request.context.user.childDistributorId = parseInt(childDistributorId, 10);

    if (isNaN(request.context.user.childDistributorId)) {
        customError = new Error("Invalid distributor Id.");
        customError.statusCode = 400;
        callback(customError);
        return;
    }

    callback(null);
}
/**
 * Load unilevel tree path
 *
 * @method loadUnilevelTreePath
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function loadUnilevelTreePath(request, callback) {
    var context = request.context,
        genealogyDao = daos.createDao('Genealogy', context),
        distributorId = context.user.distributorId,
        childDistributorId = context.user.childDistributorId;

    genealogyDao.getUnilevelTreePath(
        distributorId,
        childDistributorId,
        function (error, result) {
            if (error) {
                callback(error);
                return;
            }
            context.result = result;
            callback(null);
        }
    );
}

/**
 * convert the database result rows into response object.
 *
 * @method generateResponse
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function generateResponse(request, callback) {
    var context = request.context,
        result = { statusCode : 200},
        path = "";

    context.result.rows.forEach(function (row) {
        if (path === "") {
            path = row.distributor_id.toString();
        } else {
            path = path + '-' + row.distributor_id;
        }
    });

    result.body = {
        path: path
    };

    callback(result);
}

/**
 * Return unilevel tree path json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    async.series([
        function (callback) {
            validateRequest(request, callback);
        },
        function (callback) {
            loadUnilevelTreePath(request, callback);
        },
        function (callback) {
            generateResponse(request, callback);
        }
    ], next);
}

module.exports = get;

// GET /v2/genealogy/dualteam/extreme-bottom?childDistributorId=<id>&side=<side>

var async = require('async');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var rankMap = require('../../../../../lib/constants').rankMap;

/**
 * Validate the request.
 *
 * @method validateRequest
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function validateRequest(request, callback) {
    utils.validateParentChildRelationship(request, 'is_dt_parent_child', callback);
}

/**
 * Load dualteam tree
 *
 * @method loadDualteamTree
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function getDualteamBottomOutsideChild(request, callback) {
    var context = request.context,
        distributorDao = daos.createDao('Distributor', context),
        distributorId = parseInt(request.query['distributor-id'], 10),
        side = request.query.side;

    distributorDao.getDualteamBottomOutsideChild(
        distributorId,
        side,
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
    callback({
        statusCode : 200,
        body : {'distributor-id': request.context.result || ''}
    });
}

/**
 * Return dualteam tree json
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
            getDualteamBottomOutsideChild(request, callback);
        },
        function (callback) {
            generateResponse(request, callback);
        }
    ], next);
}

module.exports = get;

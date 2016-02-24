var async = require('async');
var daos = require('../../../../../daos');


function generateResult(result) {
    return {
        statusCode : 200,
        body : result
    };
}

/**
 *
 * Validate dualteam sponsor placement
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        sponsorId = parseInt(request.query['sponsor-id'], 10),
        side = request.query.side,
        error;

    if (!sponsorId) {
        error = new Error("Parameter 'sponsor-id' is required.");
        error.errorCode = 'InvalidSponsorId';
        error.statusCode = 400;
        next(error);
        return;
    }

    if (!side) {
        error = new Error("Parameter 'side' is required.");
        error.errorCode = 'InvalidSide';
        error.statusCode = 400;
        next(error);
        return;
    }

    if (side !== 'A' && side !== 'L' && side !== 'R') {
        error = new Error("Parameter 'side' is invalide. Must be 'A', 'L' or 'R'.");
        error.errorCode = 'InvalidSide';
        error.statusCode = 400;
        next(error);
        return;
    }

    async.waterfall([
        function (callback) {
            var distributorDao = daos.createDao('Distributor', context);
            distributorDao.validateDualteamSponsorPlacement(sponsorId, side, callback);
        }
    ], function (error, available) {
        if (error) {
            next(error);
            return;
        }

        next(generateResult({
            available : available
        }));
    });
}

module.exports = get;

// GET /v2/registrations/validations/forced-matrix

'use strict';

var async = require('async');
var daos = require('../../../../../daos');
var _ = require('underscore');


function generateResult(result) {
    return {
        statusCode : 200,
        body : result
    };
}

/**
 *
 * Validate forced matrix
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context;
    var sponsorId = parseInt(request.query['sponsor-id'], 10);
    var level = parseInt(request.query.level, 10);
    var position = parseInt(request.query.position, 10);
    var error;

    if (!_.isFinite(sponsorId)) {
        error = new Error('sponsor-id is required.');
        error.errorCode = 'InvalidSponsorId';
        error.statusCode = 400;
        next(error);
        return;
    }

    if (!_.isFinite(level)) {
        error = new Error('level is required.');
        error.errorCode = 'InvalidLevel';
        error.statusCode = 400;
        next(error);
        return;
    }
    if (!_.isFinite(position)) {
        error = new Error('position is required.');
        error.errorCode = 'InvalidPosition';
        error.statusCode = 400;
        next(error);
        return;
    }


    async.waterfall([
        function (callback) {
             var forcedMatrixDAO = daos.createDao('ForcedMatrix', context);

            forcedMatrixDAO.canAddByLevelAndPosition({
                sponsorId: sponsorId,
                level: level,
                position: position
            }, callback);
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

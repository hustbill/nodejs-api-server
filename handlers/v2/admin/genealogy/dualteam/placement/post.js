/**
 * Change dualteam position of distributor
 */

var async = require('async');
var util = require('util');
var utils = require('../../../../../../lib/utils');
var daos = require('../../../../../../daos');
var u = require('underscore');


function getPostData(request) {
    var body = request.body,
        data = {
            distributorId : parseInt(body['child-distributor-id'], 10),
            dualteamSponsorId : parseInt(body['dualteam-sponsor-distributor-id'], 10),
            dualteamPlacement : body.side
        };

    return data;
}

/**
 *
 *
 * @method respond
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        logger = context.logger,
        postData = getPostData(request),
        error;

    if (!postData.distributorId) {
        error = new Error("Child distributor id is required.");
        error.errorCode = 'InvalidChildDistributorId';
        error.statusCode = 400;
        next(error);
        return;
    }

    if (!postData.dualteamSponsorId) {
        error = new Error("Dualteam sponsor distributor id is required.");
        error.errorCode = 'InvalidDualteamSponsorDistributorId';
        error.statusCode = 400;
        next(error);
        return;
    }

    if (!postData.dualteamPlacement) {
        error = new Error("Side is required.");
        error.errorCode = 'InvalidSide';
        error.statusCode = 400;
        next(error);
        return;
    }

    if (postData.distributorId < postData.dualteamSponsorId) {
        error = new Error("Dualteam sponsor distributor id must be smaller than child distributor id.");
        error.errorCode = 'InvalidDualteamSponsorDistributorId';
        error.statusCode = 400;
        next(error);
        return;
    }

    async.waterfall([
        function (callback) {
            var distributorDao = daos.createDao('Distributor', context);
            distributorDao.changeDualteamPosition(postData, callback);
        }
    ], function (error) {
        if (error) {
            next(error);
            return;
        }

        next({statusCode : 200, body : {}});
    });
}

module.exports = post;

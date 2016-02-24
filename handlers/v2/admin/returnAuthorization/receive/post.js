// POST /v2/admin/return-authorizations/:returnAuthorizationId/receive

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var mapper = require('../../../../../mapper');


function generateResponse() {
    return {
        statusCode : 200,
        body : {}
    };
}

/**
 *
 * receive a return authorization
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        logger = context.logger,
        returnAuthorizationDao = daos.createDao('ReturnAuthorization', context),
        error;

    async.waterfall([
        function (callback) {
            var returnAuthorizationId = parseInt(request.params.returnAuthorizationId, 10);
            returnAuthorizationDao.receiveReturnAuthorization(returnAuthorizationId, callback);
        }
    ], function (error) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse());
    });
}

module.exports = post;


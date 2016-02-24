// GET /v2/admin/orders/:orderId/return-authorizations

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var mapper = require('../../../../../mapper');


function generateResponse(returnAuthorizations) {
    return {
        statusCode : 200,
        body : mapper.returnAuthorizations(returnAuthorizations)
    };
}

/**
 *
 * get return authorizations of order
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
            var orderId = parseInt(request.params.orderId, 10);
            returnAuthorizationDao.getReturnAuthorizationsByOrderId(orderId, callback);
        }
    ], function (error, returnAuthorizations) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(returnAuthorizations));
    });
}

module.exports = post;


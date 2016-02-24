// POST /v2/admin/return-authorizations/:returnAuthorizationId

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');


function getPostData(request) {
    var body = request.body,
        lineItems = body['line-items'],
        data = {
            lineItems : []
        };

    if (u.isArray(lineItems)) {
        lineItems.forEach(function (lineItem) {
            data.lineItems.push({
                variantId : parseInt(lineItem['variant-id'], 10),
                quantity : parseInt(lineItem.quantity, 10) || 0
            });
        });
    }

    data.amount = parseFloat(body.amount);

    data.reason = body.reason;

    return data;
}

function generateResponse(returnAuthorization) {
    return {
        statusCode : 200,
        body : mapper.returnAuthorization(returnAuthorization)
    };
}

/**
 *
 * update a return authorization
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        logger = context.logger,
        updateReturnAuthorizationOptions = getPostData(request),
        returnAuthorizationDao = daos.createDao('ReturnAuthorization', context),
        error;

    async.waterfall([
        function (callback) {
            updateReturnAuthorizationOptions.returnAuthorizationId = parseInt(request.params.returnAuthorizationId, 10);
            returnAuthorizationDao.updateReturnAuthorization(updateReturnAuthorizationOptions, callback);
        }
    ], function (error, returnAuthorization) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(returnAuthorization));
    });
}

module.exports = post;


// POST /v2/admin/orders/:orderId/return-authorizations

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var mapper = require('../../../../../mapper');


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
        statusCode : 201,
        body : mapper.returnAuthorization(returnAuthorization)
    };
}

/**
 *
 * create a return authorization
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        logger = context.logger,
        createReturnAuthorizationOptions = getPostData(request),
        orderDao = daos.createDao('Order', context),
        error;

    async.waterfall([
        function (callback) {
            createReturnAuthorizationOptions.orderId = parseInt(request.params.orderId, 10);
            orderDao.createReturnAuthorization(createReturnAuthorizationOptions, callback);
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


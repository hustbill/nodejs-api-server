// POST /v2/admin/orders/:orderId/adjustments

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var mapper = require('../../../../../mapper');


function getPostData(request) {
    var body = request.body,
        postData = {
            label : body.label,
            amount : parseFloat(body.amount) || 0
        };

    return postData;
}


function generateResponse(order) {
    return {
        body : mapper.order(order)
    };
}

/**
 *
 * add adjustment of order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        orderId = parseInt(request.params.orderId, 10),
        addOrderAdjustmentOptions = getPostData(request),
        orderDao = daos.createDao('Order', context),
        error;

    if (!addOrderAdjustmentOptions.label) {
        error = new Error("Label is required.");
        error.errorCode = 'InvalidLabel';
        error.statusCode = 400;
        next(error);
        return;
    }

    if (!addOrderAdjustmentOptions.amount) {
        error = new Error("Amount is required.");
        error.errorCode = 'InvalidAmount';
        error.statusCode = 400;
        next(error);
        return;
    }

    context.logger.trace("add order adjustment request body: %j", request.body);

    async.waterfall([
        function (callback) {
            addOrderAdjustmentOptions.orderId = orderId;
            orderDao.addOrderAdjustment(addOrderAdjustmentOptions, callback);
        }
    ], function (error, order) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(order));
    });
}

module.exports = post;


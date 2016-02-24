// POST /v2/admin/orders/:orderId/line-items

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var mapper = require('../../../../../mapper');


function getPostData(request) {
    var lineItems = request.body['line-items'],
        postData = [];

    if (u.isArray(lineItems)) {
        lineItems.forEach(function (lineItem) {
            postData.push({
                catalogCode : lineItem['catalog-code'],
                roleCode : lineItem['role-code'],
                variantId : parseInt(lineItem['variant-id'], 10),
                quantity : parseInt(lineItem.quantity, 10)
            });
        });
    }

    return postData;
}


function generateResponse(order) {
    return {
        body : mapper.order(order)
    };
}

/**
 *
 * change line items of order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        orderId = parseInt(request.params.orderId, 10),
        postData = getPostData(request),
        orderDao = daos.createDao('Order', context),
        error;

    context.logger.trace("change order line items request body: %j", request.body);

    async.waterfall([
        function (callback) {
            var changeLineItemsOptions = {
                orderId : orderId,
                lineItems : postData
            };
            orderDao.changeOrderLineItems(changeLineItemsOptions, callback);
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


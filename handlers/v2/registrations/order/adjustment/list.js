// POST /v2/registrations/orders/adjustments

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
                catalogCode : 'RG',
                variantId : parseInt(lineItem['variant-id'], 10),
                quantity : parseInt(lineItem.quantity, 10)
            });
        });
    }

    data.homeAddress = mapper.parseHomeAddress(body['home-address']);
    data.shippingAddress = mapper.parseShippingAddress(body['shipping-address']);
    data.billingAddress = mapper.parseBillingAddress(body['billing-address']);

    data.shippingMethodId = parseInt(body['shipping-method-id'], 10);
    data.roleCode = body['role-code'];

    return data;
}


function generateResponse(adjustments) {
    var result = {statusCode : 200};

    result.body = mapper.adjustments(adjustments);

    return result;
}


/**
 *
 * list adjustments of order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context,
        orderDao = daos.createDao('Order', context),
        postData = getPostData(request),
        error;

    async.waterfall([
        function (callback) {
            postData.registration = true;
            orderDao.getAdjustments(postData, callback);
        }
    ], function (error, adjustments) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(adjustments));
    });
}

module.exports = list;


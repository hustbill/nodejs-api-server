// POST /v2/autoships/orders/summary

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var mapper = require('../../../../../mapper');


function getPostData(request) {
    var body = request.body,
        lineItems = body['autoship-items'],
        data = {
            lineItems : []
        };

    if (u.isArray(lineItems)) {
        lineItems.forEach(function (lineItem) {
            data.lineItems.push({
                catalogCode : lineItem['catalog-code'] || 'AT',
                roleCode : lineItem['role-code'],
                variantId : parseInt(lineItem['variant-id'], 10),
                quantity : parseInt(lineItem.quantity, 10)
            });
        });
    }

    data.shippingAddress = mapper.parseShippingAddress(body['shipping-address']);
    data.billingAddress = mapper.parseBillingAddress(body['billing-address']);
    data.shippingMethodId = parseInt(body['shipping-method-id'], 10);

    return data;
}


function generateResponse(order) {
    return {
        body : mapper.autoshipOrderSummary(order)
    };
}

/**
 *
 * create a new order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        checkoutOrderOptions = getPostData(request),
        orderDao = daos.createDao('Order', context),
        error;

    async.waterfall([
        function (callback) {
            checkoutOrderOptions.userId = context.user.userId;
            // indicate that we are checkout for autoship.
            checkoutOrderOptions.autoship = true;
            checkoutOrderOptions.validateAddresses = true;
            orderDao.checkoutOrder(checkoutOrderOptions, callback);
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


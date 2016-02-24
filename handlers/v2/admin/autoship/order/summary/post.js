// POST /v2/admin/autoships/orders/summary

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../../daos');
var utils = require('../../../../../../lib/utils');
var mapper = require('../../../../../../mapper');


function parseAutoshipAdjustment(data) {
    return {
        amount : parseFloat(data.amount) || 0,
        label : data.label
    };
}

function parseAutoshipAdjustments(data) {
    if (!data) {
        return null;
    }

    return data.map(parseAutoshipAdjustment);
}

function getPostData(request) {
    var body = request.body,
        lineItems = body['autoship-items'],
        data = {
            lineItems : []
        };

    data.userId = parseInt(body['user-id'], 10);

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

    data.additionalAdjustments = parseAutoshipAdjustments(body['autoship-adjustments']);

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


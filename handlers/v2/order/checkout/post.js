// POST /v2/orders/checkout

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');


function getPostData(request) {
    var body = request.body,
        data = {};

    data.lineItems = mapper.parseLineItems(body['line-items'], 'SP');

    data.shippingAddress = mapper.parseShippingAddress(body['shipping-address']);
    data.billingAddress = mapper.parseBillingAddress(body['billing-address']);

    data.shippingMethodId = parseInt(body['shipping-method-id'], 10);
    data.coupons = mapper.parseOrderCoupons(body.coupons);

    return data;
}


function generateResponse(order) {
    return {
        body : mapper.order(order)
    };
}

/**
 *
 * checkout order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        checkoutOrderOptions = getPostData(request),
        orderDao = daos.createDao('Order', context),
        error;

    context.logger.trace("checkout order request body: %j", request.body);

    async.waterfall([
        function (callback) {
            checkoutOrderOptions.userId = context.user.userId;
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


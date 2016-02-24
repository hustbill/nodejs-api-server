// POST /v2/orders

var async = require('async');
var u = require('underscore');
var daos = require('../../../daos');
var utils = require('../../../lib/utils');
var lockHelper = require('../../../lib/lockHelper');
var mapper = require('../../../mapper');


function parseCoupon(data) {
    if (!data) {
        return null;
    }

    return {
        code : data.code
    };
}


function getPostData(request) {
    var body = request.body,
        data = {};

    data.lineItems = mapper.parseLineItems(body['line-items'], 'SP');

    data.shippingAddress = mapper.parseShippingAddress(body['shipping-address']);
    data.billingAddress = mapper.parseBillingAddress(body['billing-address']);

    data.shippingMethodId = parseInt(body['shipping-method-id'], 10);
    data.paymentMethodId = parseInt(body['payment-method-id'], 10);
    if (body.hasOwnProperty('payment-amount')) {
        data.paymentAmount = parseFloat(body['payment-amount']);
    }

    data.creditcard = mapper.parseCreditcard(body.creditcard);
    data.giftCard = mapper.parseGiftCard(body.giftcard);
    data.specialInstructions = body['special-instructions'];
    data.coupons = mapper.parseOrderCoupons(body.coupons);

    if (body['optional-fields']) {
        data.eventCode = body['optional-fields']['event-code'];
    }

    return data;
}


function generateResponse(order) {
    return {
        statusCode : 201,
        body : {
            'order-id' : order.id,
            'order-number' : order.number,
            'order-date' : order.order_date,
            'total' : order.total,
            'state' : order.state,
            'payment-state' : order.payment_state,
            'payment-total' : order.payment_total,
            'payment-date' : order.completed_at
        }
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
        logger = context.logger,
        clientRequestId = request.get('x-client-request-id'),
        createOrderOptions = getPostData(request),
        creditcard = createOrderOptions.creditcard,
        orderDao = daos.createDao('Order', context),
        error;

    logger.trace("creat order request body: %j", request.body);

    if (creditcard) {
        if (!utils.isValidCreditcardInfo(creditcard)) {
            error = new Error('Invalid credit card info.');
            error.errorCode = 'InvalidCreditcardInfo';
            error.statusCode = 400;

            logger.error('Invalid credit card info. %j', creditcard);
            next(error);
            return;
        }

        if (creditcard.year.length === 2) {
            creditcard.year = (new Date()).getFullYear().toString().substr(0, 2) + creditcard.year;
        }
        if (creditcard.month.length === 1) {
            creditcard.month = '0' + creditcard.month;
        }
    }

    async.waterfall([
        function (callback) {
            if (!clientRequestId) {
                callback();
                return;
            }

            orderDao.existsOrderByClientRequestId(clientRequestId, function (error, exists) {
                if (error) {
                    callback(error);
                    return;
                }

                if (exists) {
                    error = new Error("Duplicate creating order request.");
                    error.errorCode = 'InvalidClientRequestId';
                    error.statusCode = 409;
                    callback(error);
                    return;
                }

                lockHelper.lock(context, clientRequestId, function (error, succeeded) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!succeeded) {
                        var error = new Error("Order creating request is processing.");
                        error.errorCode = 'RequestProcessing';
                        error.statusCode = 409;
                        callback(error);
                        return;
                    }

                    callback();
                });
            });
        },

        function (callback) {
            createOrderOptions.userId = context.user.userId;
            createOrderOptions.clientRequestId = clientRequestId;
            orderDao.createOrder(createOrderOptions, callback);
        }
    ], function (error, order) {
        if (error && error.errorCode === 'RequestProcessing') {
            next(error);
            return;
        }

        lockHelper.unlock(context, clientRequestId, function () {
            if (error) {
                next(error);
                return;
            }

            var siteUrl = context.config.siteUrl || '';
            response.set('Location', siteUrl + '/v2/orders/' + order.id);
            next(generateResponse(order));
        });
    });
}

module.exports = post;


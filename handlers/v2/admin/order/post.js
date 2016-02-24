// POST /v2/admin/orders

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var lockHelper = require('../../../../lib/lockHelper');
var mapper = require('../../../../mapper');


function parseAdjustments(data) {
    if (!data) {
        return null;
    }

    if (!u.isArray(data)) {
        return null;
    }

    var adjustments = [];
    data.forEach(function (item) {
        adjustments.push({
            label : item.label,
            amount : parseFloat(item.amount) || 0
        });
    })

    return adjustments;
}


function getPostData(request) {
    var body = request.body,
        lineItems = body['line-items'],
        data = {
            lineItems : []
        };

    data.userId = parseInt(body['user-id'], 10);

    if (u.isArray(lineItems)) {
        lineItems.forEach(function (lineItem) {
            data.lineItems.push({
                catalogCode : lineItem['catalog-code'],
                roleCode : lineItem['role-code'],
                variantId : parseInt(lineItem['variant-id'], 10),
                quantity : parseInt(lineItem.quantity, 10),
                personalizedValues : mapper.parseLineItemPersonalizedValues(lineItem['personalized-values'])
            });
        });
    }

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

    data.additionalAdjustments = parseAdjustments(body.adjustments);

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

    logger.debug("creat order request body: %j", request.body);

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
                        error = new Error("Order creating request is processing.");
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
            response.set('Location', siteUrl + '/v2/admin/orders/' + order.id);
            next(generateResponse(order));
        });
    });
}

module.exports = post;


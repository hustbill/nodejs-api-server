// POST /v2/admin/autoships

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');
var mapper = require('../../../../mapper');

function getLineItemsFromData(input, defaultCatalogCode) {
    var lineItems = [];

    if (u.isArray(input)) {
        input.forEach(function (lineItem) {
            lineItems.push({
                catalogCode : lineItem['catalog-code'] || defaultCatalogCode,
                roleCode : lineItem['role-code'],
                variantId : parseInt(lineItem['variant-id'], 10),
                quantity : parseInt(lineItem.quantity, 10)
            });
        });
    }

    return lineItems;
}

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
            autoshipItems : getLineItemsFromData(body['autoship-items'], 'AT')
        };

    data.userId = parseInt(body['user-id'], 10);

    data.shippingAddress = mapper.parseShippingAddress(body['shipping-address']);
    data.billingAddress = mapper.parseBillingAddress(body['billing-address']);
    data.shippingMethodId = parseInt(body['shipping-method-id'], 10);

    data.paymentMethodId = parseInt(body['payment-method-id'], 10);
    data.creditcard = mapper.parseCreditcard(body.creditcard);

    data.activeDate = parseInt(body['autoship-day'], 10);
    data.startDate = new Date(Date.parse(body['start-date']));
    data.frequencyByMonth = parseInt(body['frequency-by-month'], 10);
    if (body['next-autoship-date']) {
        data.nextAutoshipDate = new Date(Date.parse(body['next-autoship-date']));
    }

    data.autoshipAdjustments = parseAutoshipAdjustments(body['autoship-adjustments']);

    return data;
}

function generateResponse(autoship) {
    var result = {
            statusCode : 200,
            body : mapper.autoship(autoship)
        };

    return result;
}

/**
 * Create autoship
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        createAutoshipOptions = getPostData(request);

    async.waterfall([
        function (callback) {
            var autoshipDao = daos.createDao('Autoship', context);
            autoshipDao.createAutoship(createAutoshipOptions, callback);
        }
    ], function (error, autoship) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(autoship));
    });
}

module.exports = post;

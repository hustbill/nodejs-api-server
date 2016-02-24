var async = require('async');
var daos = require('../../daos');
var utils = require('../../lib/utils');


exports.getType = function () {
    return 'Calculator::SingleProductShipQuantityRate';
};


function parsePreferenceValue(text) {
    if (!text) {
        return [];
    }

    var values = [],
        array = text.split(',');

    array.forEach(function (item) {
        if (item) {
            values.push(parseFloat(item) || 0);
        }
    });

    return values;
}


function calculateShippingCost(itemValue, shippingValues, shippingFees) {
    if (itemValue === 0) {
        return 0;
    }

    var feeIndex;

    for (feeIndex = 0; feeIndex < shippingValues.length; feeIndex += 1) {
        if (shippingValues[feeIndex] >= itemValue) {
            break;
        }
    }

    if (feeIndex >= shippingFees.length) {
        feeIndex = shippingFees.length - 1;
    }

    return shippingFees[feeIndex] || 0;
}

function calculateSingleProductShippingCost(context, lineItem, calculatorId, callback) {
    if (!lineItem.quantity) {
        callback(null, 0);
        return;
    }

    async.waterfall([
        function (callback) {
            var preferenceDao = daos.createDao('Preference', context);
            preferenceDao.getPreferencesOfGroupAndOwner('Calculator', calculatorId, 'Product', lineItem.product_id, callback);
        },

        function (preferences, callback) {
            if (!preferences) {
                callback(null, 0);
                return;
            }

            var shippingFees,
                minimumFee,
                incrementFee,
                itemQuantity,
                shippingCost;

            shippingFees = parsePreferenceValue(preferences.shipping_fees);
            minimumFee = shippingFees[0];
            incrementFee = shippingFees[1];

            itemQuantity = lineItem.quantity;
            shippingCost = minimumFee + incrementFee * (itemQuantity - 1);
            callback(null, shippingCost);
        }
    ], callback);
}


exports.compute = function (context, order, calculatorId, callback) {
    async.waterfall([
        function (callback) {
            var orderDao = daos.createDao('Order', context);
            orderDao.getUserOfOrder(order, callback);
        },

        function (user, callback) {
            var lineItemDao = daos.createDao('LineItem', context);
            lineItemDao.getNonFreeShippingItems(user, order.lineItems, callback);
        },

        function (nonFreeShippingItems, callback) {
            var totalAmount = 0;

            async.forEachSeries(order.lineItems, function (lineItem, callback) {
                calculateSingleProductShippingCost(context, lineItem, calculatorId, function (error, shippingCost) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    totalAmount += shippingCost;
                    callback();
                });
            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, utils.roundMoney(totalAmount));
            });
        }
    ], callback);
};

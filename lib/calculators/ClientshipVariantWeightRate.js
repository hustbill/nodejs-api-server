var async = require('async');
var daos = require('../../daos');


exports.getType = function () {
    return 'Calculator::ClientshipVariantWeightRate';
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


exports.compute = function (context, order, calculatorId, callback) {
    var logger = context.logger,
        shippingValues,
        shippingFees;

    async.waterfall([
        function (callback) {
            var preferenceDao = daos.createDao('Preference', context);
            preferenceDao.getPreferencesOfOwner('Calculator', calculatorId, callback);
        },

        function (preferences, callback) {
            var orderDao,
                error;

            if (!preferences || !preferences.shipping_values || !preferences.shipping_fees) {
                error = new Error("Can't compute rate. Preferences of calculator " + calculatorId + " were not set.");
                error.errorCode = 'PreferencesOfCalculatorNotSet';
                logger.error(error.message);
                callback(error);
                return;
            }

            shippingValues = parsePreferenceValue(preferences.shipping_values);
            shippingFees = parsePreferenceValue(preferences.shipping_fees);

            orderDao = daos.createDao('Order', context);
            orderDao.getUserOfOrder(order, callback);
        },

        function (user, callback) {
            var lineItemDao = daos.createDao('LineItem', context);
            lineItemDao.getNonFreeShippingItems(user, order.lineItems, callback);
        },

        function (nonFreeShippingItems, callback) {
			if (!nonFreeShippingItems.length) {
				callback(null, 0);
				return;
			}

            var nonFreeShippingItemValue,
                shippingCost;

            nonFreeShippingItemValue = nonFreeShippingItems.reduce(function (sum, item) {
                return sum + ((item.variant.weight || 0) * item.quantity);
            }, 0);
            shippingCost = calculateShippingCost(nonFreeShippingItemValue, shippingValues, shippingFees);

            callback(null, shippingCost);
        }
    ], callback);
};

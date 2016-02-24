var async = require('async');
var daos = require('../../daos');
var utils = require('../../lib/utils');


exports.getType = function () {
    return 'Calculator::SingleProductShipFlatRate';
};


function calculateSingleProductShippingCost(context, productId, calculatorId, callback) {
    async.waterfall([
        function (callback) {
            var preferenceDao = daos.createDao('Preference', context);
            preferenceDao.getPreferencesOfGroupAndOwner('Calculator', calculatorId, 'Product', productId, callback);
        },

        function (preferences, callback) {
            if (!preferences) {
                callback(null, 0);
                return;
            }

            callback(null, parseFloat(preferences.amount) || 0);
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
            if (!nonFreeShippingItems.length) {
                callback(null, 0);
                return;
            }

            var totalAmount = 0

            async.forEachSeries(order.lineItems, function (lineItem, callback) {
                calculateSingleProductShippingCost(context, lineItem.product_id, calculatorId, function (error, shippingCost) {
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

var async = require('async');
var daos = require('../../daos');


exports.getType = function () {
    return 'Calculator::ClientshipBulkRate';
};


function calculateShippingCost(itemsCount, incrementUnit, incrementFee, minimumFee) {
    if (itemsCount === 0) {
        return 0;
    }

    if (itemsCount === incrementUnit) {
	return minimumFee;
    }

    var fee = Math.ceil((itemsCount - incrementUnit) / incrementUnit) * incrementFee;
    return (fee + minimumFee);
}


exports.compute = function (context, order, calculatorId, callback) {
    var logger = context.logger,
        incrementUnit,
        incrementFee,
        minimumFee;

    async.waterfall([
        function (callback) {
            var preferenceDao = daos.createDao('Preference', context);
            preferenceDao.getPreferencesOfOwner('Calculator', calculatorId, callback);
        },

        function (preferences, callback) {
            var orderDao,
                error;

            if (!preferences || !preferences.increment_unit || !preferences.increment_fee) {
                error = new Error("Can't compute rate. Preferences of calculator " + calculatorId + " were not set.");
                error.errorCode = 'PreferencesOfCalculatorNotSet';
                logger.error(error.message);
                callback(error);
                return;
            }

            incrementUnit = parseFloat(preferences.increment_unit) || 0;
            incrementFee = parseFloat(preferences.increment_fee) || 0;
            minimumFee = parseFloat(preferences.minimum_fee) || 0;

            orderDao = daos.createDao('Order', context);
            orderDao.getUserOfOrder(order, callback);
        },

        function (user, callback) {
            var lineItemDao = daos.createDao('LineItem', context);
            lineItemDao.getNonFreeShippingItemsCount(user, order.lineItems, callback);
        },

        function (itemsCount, callback) {
            var shippingCost = calculateShippingCost(itemsCount, incrementUnit, incrementFee, minimumFee);
            callback(null, shippingCost);
        }
    ], callback);
};

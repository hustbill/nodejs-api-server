var async = require('async');
var daos = require('../../daos');


exports.getType = function () {
    return 'Calculator::FlatRate';
};


exports.compute = function (context, order, calculatorId, callback) {
    var logger = context.logger;

    async.waterfall([
        function (callback) {
            var preferenceDao = daos.createDao('Preference', context);
            preferenceDao.getPreferencesOfOwner('Calculator', calculatorId, callback);
        },

        function (preferences, callback) {
            if (!preferences) {
                var error = new Error("Can't compute rate. Preferences of calculator " + calculatorId + " were not set.");
                error.errorCode = 'PreferencesOfCalculatorNotSet';
                logger.error(error.message);
                callback(error);
                return;
            }

            callback(null, parseFloat(preferences.amount) || 0);
        }
    ], callback);
};

var rateCalculator = require('../rateCalculator');


exports.getType = function () {
    return 'Calculator::ClientpickupTierRate';
};


exports.compute = function (context, order, calculatorId, callback) {
    rateCalculator.computeRate(context, 'get_clientpickup_DO_tiered_rate', order, calculatorId, callback);
};

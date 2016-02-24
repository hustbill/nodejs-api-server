var rateCalculator = require('../rateCalculator');


exports.getType = function () {
    return 'Calculator::ClientshipDoTieredRate';
};


exports.compute = function (context, order, calculatorId, callback) {
    rateCalculator.computeRate(context, 'get_clientship_DO_tiered_rate', order, calculatorId, callback);
};

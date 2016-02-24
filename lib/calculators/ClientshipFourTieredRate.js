var rateCalculator = require('../rateCalculator');


exports.getType = function () {
    return 'Calculator::ClientshipFourTieredRate';
};


exports.compute = function (context, order, calculatorId, callback) {
    rateCalculator.computeRate(context, 'get_clientship_four_tiered_rate', order, calculatorId, callback);
};

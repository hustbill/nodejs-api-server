var rateCalculator = require('../rateCalculator');


exports.getType = function () {
    return 'Calculator::CaQst';
};


exports.compute = function (context, order, calculatorId, callback) {
    rateCalculator.computeRate(context, 'get_ca_qst', order, calculatorId, callback);
};

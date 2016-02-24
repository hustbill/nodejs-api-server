var rateCalculator = require('../rateCalculator');


exports.getType = function () {
    return 'Calculator::CaPst';
};


exports.compute = function (context, order, calculatorId, callback) {
    rateCalculator.computeRate(context, 'get_ca_pst', order, calculatorId, callback);
};

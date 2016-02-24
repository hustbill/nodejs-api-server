var rateCalculator = require('../rateCalculator');


exports.getType = function () {
    return 'Calculator::Vat';
};


exports.compute = function (context, order, calculatorId, callback) {
    rateCalculator.computeRate(context, 'get_vat', order, calculatorId, callback);
};

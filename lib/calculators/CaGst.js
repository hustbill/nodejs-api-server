var rateCalculator = require('../rateCalculator');


exports.getType = function () {
    return 'Calculator::CaGst';
};


exports.compute = function (context, order, calculatorId, callback) {
    rateCalculator.computeRate(context, 'get_ca_gst', order, calculatorId, callback);
};

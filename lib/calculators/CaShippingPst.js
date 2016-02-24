var rateCalculator = require('../rateCalculator');


exports.getType = function () {
    return 'Calculator::CaShippingPst';
};


exports.compute = function (context, order, calculatorId, callback) {
    rateCalculator.computeRate(context, 'get_shipping_vat', order, calculatorId, callback);
};

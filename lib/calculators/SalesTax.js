var rateCalculator = require('../rateCalculator');


exports.getType = function () {
    return 'Calculator::SalesTax';
};


exports.compute = function (context, order, calculatorId, callback) {
    rateCalculator.computeRate(context, 'get_sales_tax', order, calculatorId, callback);
};

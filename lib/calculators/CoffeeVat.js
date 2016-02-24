var rateCalculator = require('../rateCalculator');


exports.getType = function () {
    return 'Calculator::CoffeeVat';
};


exports.compute = function (context, order, calculatorId, callback) {
    rateCalculator.computeRate(context, 'get_coffee_vat', order, calculatorId, callback);
};

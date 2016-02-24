var rateCalculator = require('../rateCalculator');


exports.getType = function () {
    return 'Calculator::VatCoffeeVat';
};


exports.compute = function (context, order, calculatorId, callback) {
    rateCalculator.computeRate(context, 'get_vat_coffee_vat', order, calculatorId, callback);
};

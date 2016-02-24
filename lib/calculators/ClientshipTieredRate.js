var async = require('async');


exports.getType = function () {
    return 'Calculator::ClientshipTieredRate';
};


exports.compute = function (context, order, calculatorId, callback) {
    async.waterfall([
        function (callback) {
            callback(null, 0);
        }
    ], callback);
};

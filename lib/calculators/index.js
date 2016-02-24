/*jslint regexp: true, nomen: true */

var async = require('async');
var fs = require('fs');
var path = require('path');
var sidedoor = require('sidedoor');
var LazyLoader = require('../lazyLoader');

var calculatorLoader = null;


function loadCalculators(context, callback) {
    async.waterfall([
        function (callback) {
            var calculatorsArray = [];

            fs.readdirSync(__dirname).forEach(function (filename) {
                var fullPath,
                    stat,
                    match;

                // Skip itself
                if (filename === 'index.js' || /^\./.test(filename)) {
                    return;
                }

                fullPath = path.join(__dirname, filename);
                stat = fs.statSync(fullPath);

                if (!stat.isDirectory()) {
                    match = /(\w+)\.js$/.exec(filename);

                    if (match) {
                        calculatorsArray.push(require(fullPath));
                    }
                }
            });

            callback(null, calculatorsArray);
        },

        function (calculatorsArray, callback) {
            var calculatorsMap = {};
            calculatorsArray.forEach(function (eachCalculator) {
                calculatorsMap[eachCalculator.getType()] = eachCalculator;
            });
            callback(null, calculatorsMap);
        }
    ], callback);
}


function getCalculator(context, calculatorType, callback) {
    if (!calculatorLoader) {
        calculatorLoader = new LazyLoader();
    }

    calculatorLoader.load(loadCalculators.bind(this, context), function (error, calculators) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, calculators[calculatorType]);
    });
}


exports.compute = function (context, object, calculatorId, calculatorType, callback) {
    getCalculator(context, calculatorType, function (error, calculator) {
        if (error) {
            callback(error);
            return;
        }

        if (!calculator) {
            error = new Error("Unknown calculator type.");
            context.logger.error("Unknown calculator type: %s", calculatorType);
            callback(null, error);
        }

        calculator.compute(context, object, calculatorId, callback);
    });
};

sidedoor.expose(module, 'privateAPIes', {
    getCalculator : getCalculator
});

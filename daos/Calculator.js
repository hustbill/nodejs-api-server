/**
 * Calculator DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var LazyLoader = require('../lib/lazyLoader');

var calculatorsLoader = null;
var calculatorsMap = null;


function Calculator(context) {
    DAO.call(this, context);
}

util.inherits(Calculator, DAO);


function loadCalculators(context, callback) {
    if (!calculatorsLoader) {
        calculatorsLoader = new LazyLoader();
    }

    calculatorsLoader.load(
        function (callback) {
            context.readModels.Calculator.findAll({
                where : {deleted_at : null}
            }).success(function (calculatorEntities) {
                callback(null, calculatorEntities);
            }).error(callback);
        },

        function (error, calculators) {
            if (error) {
                callback(error);
                return;
            }

            if (!calculatorsMap) {
                calculatorsMap = {};
                calculators.forEach(function (eachCalculator) {
                    calculatorsMap[eachCalculator.calculable_type + eachCalculator.calculable_id] = eachCalculator;
                });
            }

            callback(null, calculators);
        }
    );
}


Calculator.prototype.getAllCalculators = function (callback) {
    var context = this.context;
    context.readModels.Calculator.findAll({
        where : {deleted_at : null}
    }).done(callback);
};


Calculator.prototype.getCalculatorOfCalculableObject = function (calculableType, calculableId, callback) {
    var context = this.context,
        logger = context.logger;

    logger.trace("Getting calculator of %s %d", calculableType, calculableId);
    async.waterfall([
        function (callback) {
            context.readModels.Calculator.find({
                where : {
                    calculable_type : calculableType,
                    calculable_id : calculableId,
                    deleted_at : null
                }
            }).done(callback);
        }
    ], callback);
};


Calculator.prototype.getCalculatorsOfCalculableObject = function (calculableType, calculableId, callback) {
    var context = this.context,
        logger = context.logger;

    logger.trace("Getting calculators of %s %d", calculableType, calculableId);
    async.waterfall([
        function (callback) {
            context.readModels.Calculator.findAll({
                where : {
                    calculable_type : calculableType,
                    calculable_id : calculableId,
                    deleted_at : null
                }
            }).done(callback);
        }
    ], callback);
};


module.exports = Calculator;

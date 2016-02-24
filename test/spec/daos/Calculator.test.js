/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var util = require('util');

var sutPath = '../../../daos/Calculator.js';
var CalculatorDao = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : true,
        database : true
    }, callback);
}


describe('daos/Calculator', function () {
    describe('getAllCalculators()', function () {
        it('should callback all calculators', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var calculatorDao = new CalculatorDao(context);
                    calculatorDao.getAllCalculators(callback);
                },

                function (calculators, callback) {
                    expect(calculators).to.be.ok;

                    callback();
                }
            ], done);
        });
    });

    describe('getCalculatorOfCalculableObject()', function () {
        it('should callback calculator by given calculableType and calculableId', function (done) {
            var context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    context.readModels.Calculator.findAll().success(function (calculators) {
                        callback(null, calculators);
                    }).error(callback);
                },

                function (calculators, callback) {
                    var calculatorDao = new CalculatorDao(context);
                    async.forEachSeries(calculators, function (eachCalculator, callback) {
                        calculatorDao.getCalculatorOfCalculableObject(
                            eachCalculator.calculable_type,
                            eachCalculator.calculable_id,
                            function (error, calculator) {
                                if (error) {
                                    callback(error);
                                    return;
                                }

                                if (eachCalculator.deleted_at) {
                                    expect(calculator).to.be.not.ok;
                                } else {
                                    expect(calculator).to.be.ok;
                                    expect(calculator.id).to.equal(eachCalculator.id);
                                    expect(calculator.type).to.equal(eachCalculator.type);
                                }

                                callback();
                            }
                        );
                    }, callback);
                }

            ], done);
        });
    });
});


/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var sidedoor = require('sidedoor');
var testUtil = require('../../testUtil');
var util = require('util');
var daos = require('../../../daos/index');

var sutPath = '../../../lib/calculators/FlatRate.js';
var Calculator = require(sutPath);
var privateAPIes = sidedoor.get(sutPath, 'privateAPIes');
var calculatorType = 'Calculator::FlatRate';


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        user : true
    }, callback);
}


describe('lib/calculator/FlateRate', function () {
    describe('getType()', function () {
        it('should be ' + calculatorType, function () {
            expect(Calculator.getType()).to.equal(calculatorType);
        });
    });

    describe('compute()', function () {
        it('should return amout that defined in preferences table', function (done) {
            var context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    context.readModels.Calculator.findAll({
                        where : {type : calculatorType}
                    }).done(callback);
                },

                function (calculators, callback) {
                    async.forEachSeries(calculators, function (eachCalculator, callback) {
                        var calculatorId = eachCalculator.id,
                            amountActual,
                            amountExpected;

                        async.waterfall([
                            function (callback) {
                                Calculator.compute(context, null, calculatorId, function (error, amount) {
                                    if (error) {
                                        callback(error);
                                        return;
                                    }

                                    amountActual = amount;
                                    callback();
                                });
                            },

                            function (callback) {
                                context.readModels.Preference.find({
                                    where : {
                                        owner_type : 'Calculator',
                                        owner_id : calculatorId,
                                        name : 'amount'
                                    }
                                }).done(function (error, preference) {
                                    if (error) {
                                        callback(error);
                                        return;
                                    }

                                    amountExpected = parseFloat(preference.value) || 0;
                                    callback();
                                });
                            },

                            function (callback) {
                                expect(amountActual).to.be.number;
                                expect(amountActual).to.equal(amountExpected);
                                callback();
                            }
                        ], callback);
                    }, callback);
                }
            ], done);
        });
    });
});


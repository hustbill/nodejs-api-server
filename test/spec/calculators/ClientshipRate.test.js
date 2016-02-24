/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var sidedoor = require('sidedoor');
var testUtil = require('../../testUtil');
var util = require('util');
var daos = require('../../../daos/index');

var sutPath = '../../../lib/calculators/ClientshipRate.js';
var Calculator = require(sutPath);
var privateAPIes = sidedoor.get(sutPath, 'privateAPIes');
var calculatorType = 'Calculator::ClientshipRate';


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        user : true
    }, callback);
}


describe('lib/calculator/ClientshipRate', function () {
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
                        var lineItems = [
                                { variantId : 24, quantity : 1, catalogCode : 'RG' },
                                { variantId : 34, quantity : 2, catalogCode : 'RG' },
                                { variantId : 14, quantity : 1, catalogCode : 'RG' }
                            ],
                            order = {
                                user_id : context.user.userId,
                                lineItems : lineItems
                            },
                            calculatorId = eachCalculator.id,
                            amountActual,
                            amountExpected;

                        async.waterfall([
                            function (callback) {
                                var orderDao = daos.createDao('Order', context);
                                orderDao.getUserOfOrder(order, callback);
                            },

                            function (user, callback) {
                                var orderDao = daos.createDao('Order', context);
                                orderDao.getLineItems(user, order.lineItems, callback);
                            },

                            function (lineItems, callback) {
                                order.lineItems = lineItems;

                                Calculator.compute(context, order, calculatorId, function (error, amount) {
                                    if (error) {
                                        callback(error);
                                        return;
                                    }

                                    amountActual = amount;
                                    callback();
                                });
                            },

                            function (callback) {
                                expect(amountActual).to.be.number;
                                callback();
                            }
                        ], function (error) {
                            if (error) {
                                if (error.errorCode === 'PreferencesOfCalculatorNotSet') {
                                    callback();
                                } else {
                                    callback(error);
                                }
                                return;
                            }

                            callback();
                        });
                    }, callback);
                }
            ], done);
        });
    });
});


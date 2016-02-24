/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var sidedoor = require('sidedoor');
var testUtil = require('../../testUtil');
var util = require('util');
var daos = require('../../../daos/index');

var sutPath = '../../../lib/calculators/index.js';
var calculators = require(sutPath);
var privateAPIes = sidedoor.get(sutPath, 'privateAPIes');


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : true,
        database : true,
        extend : {
            user : {userId : testUtil.getTestUserId()}
        }
    }, callback);
}


describe('lib/calculators', function () {
    describe('getCalculator()', function () {
        it('should work', function (done) {
            var context,
                calculatorTypes = [
                    'Calculator::CaGst',
                    'Calculator::CaPst',
                    'Calculator::CaQst',
                    'Calculator::CaShippingGst',
                    'Calculator::CaShippingPst',
                    'Calculator::CaShippingQst',
                    'Calculator::ClientpickupTierRate',
                    'Calculator::ClientshipDoTieredRate',
                    'Calculator::ClientshipFourTieredRate',
                    'Calculator::ClientshipRate',
                    'Calculator::ClientshipTieredRate',
                    'Calculator::CoffeeVat',
                    'Calculator::FlatRate',
                    'Calculator::SalesTax',
                    'Calculator::ShippingVat',
                    'Calculator::Vat',
                    'Calculator::VatCoffeeVat'
                ];

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    async.forEachSeries(calculatorTypes, function (eachType, callback) {
                        privateAPIes.getCalculator(context, eachType, function (error, calculator) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            if (!calculator) {
                                callback(new Error("Can't get calculator of type '" + eachType + "'."));
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


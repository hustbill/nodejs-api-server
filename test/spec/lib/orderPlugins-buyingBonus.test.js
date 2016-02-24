/*global describe, it */
/*jshint expr:true */

var rewire = require('rewire');
var expect = require('chai').expect;
var async = require('async');
var daos = require('../../../daos');
var testUtil = require('../../testUtil');
var couponHelper = require('../../helpers/couponHelper');
var mapper = require('../../../mapper');

var suitPath = '../../../lib/orderPlugins/buyingBonus.js';
var BuyingBonusPlugin = rewire(suitPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        redis : true,
        user : true
    }, callback);
}

describe('lib/orderPlugins/coupon', function () {
    var context,
        couponProductGroup = null;

    before(function (done) {
        async.waterfall([
            getContext,

            function (result, callback) {
                context = result;

                couponHelper.createBuyingBonusCoupons(context, function (error) {
                    callback(error);
                });
            }
        ], done);
    });

    describe('onValidateOptions()', function () {
        it('should callback error if try using a coupon not allowed', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var options = {
                            coupons : [
                                {code : 'buying-bonus-one-free-product'}
                            ]
                        },
                        order = {
                            user_id : context.user.userId,
                            lineItems : [
                                {price : 1000, quantity : 1, role_code : 'D'}
                            ]
                        };
                    BuyingBonusPlugin.onValidateOptions(context, 'checkoutOrder', options, order, function (error) {
                        console.log(error);
                        expect(error).to.be.instanceof(Error);
                        expect(error.errorCode).to.equal('InvalidCoupon');

                        callback();
                    });
                }
            ], done);
        });
    });

    describe('afterCheckout()', function () {
        it('order.availableCoupons should be `buying-bonus-one-free-product` and `buying-bonus-two-free-products` if accumulated order total is 500', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var options = {},
                        order = {
                            lineItems : [
                                {price : 500, quantity : 1, role_code : 'D'}
                            ]
                        };
                    BuyingBonusPlugin.afterCheckout(context, 'checkoutOrder', options, order, function (error) {
                        if (error) {
                            callback();
                            return;
                        }

                        expect(order.availableCoupons.length).to.equal(2);
                        callback();
                    });
                }
            ], done);
        });

        it('order.availableCoupons should be `buying-bonus-one-60%-off-product` and `buying-bonus-two-60%-off-products` if accumulated order total is 1000', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var options = {},
                        order = {
                            user_id : context.user.userId,
                            lineItems : [
                                {price : 1000, quantity : 1, role_code : 'D'}
                            ]
                        };
                    BuyingBonusPlugin.afterCheckout(context, 'checkoutOrder', options, order, function (error) {
                        if (error) {
                            callback();
                            return;
                        }

                        expect(order.availableCoupons.length).to.equal(2);
                        callback();
                    });
                }
            ], done);
        });
    });
});

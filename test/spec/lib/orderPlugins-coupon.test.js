/*global describe, it */
/*jshint expr:true */

var rewire = require('rewire');
var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var couponHelper = require('../../helpers/couponHelper');

var suitPath = '../../../lib/orderPlugins/coupon.js';
var CouponPlugin = rewire(suitPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        redis : true,
        user : true
    }, callback);
}

function createCouponProductGroup(context, groupProducts, callback) {
    couponHelper.createCouponProductGroup(context, {groupProducts : groupProducts}, callback);
}

describe('lib/orderPlugins/coupon', function () {
    describe('onValidateOptions()', function () {
        it('should work if no coupon is used', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var options = {
                            coupons : []
                        },
                        order = {};
                    CouponPlugin.onValidateOptions(context, 'createOrder', options, order, function (error) {
                        expect(error).to.be.not.ok;
                        expect(order.couponsToBeUsed).to.eql([]);

                        callback();
                    });
                }
            ], done);
        });

        it('should not use same coupon more than once in one order', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var options = {
                            coupons : [
                                {code : 'foo'},
                                {code : 'foo'}
                            ]
                        },
                        order = {};
                    CouponPlugin.onValidateOptions(context, 'createOrder', options, order, function (error) {
                        expect(error).to.be.instanceOf(Error);
                        expect(error).errorCode = 'InvalidCoupon';

                        callback();
                    });
                }
            ], done);
        });
    });

    describe('beforeSaveLineItems()', function () {
        it('should change commission of line items', function (done) {
            var tick = (new Date()).getTime(),
                context,
                coupon;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var groupProducts = [
                            {product_id : 1, catalog_id : 1},
                            {product_id : 2, catalog_id : 1}
                        ];
                    createCouponProductGroup(context, groupProducts, callback);
                },

                function (couponProductGroup, callback) {
                    context.models.Coupon.create({
                        code : 'coupon-' + tick,
                        active : true,
                        is_single_user : false,
                        usage_count : 1,
                        rules : JSON.stringify({
                            allow_all_products : false,
                            commissionable_percentage : 90,
                            coupon_product_group_id : couponProductGroup.id,
                            operation : 'percent_off',
                            operation_amount : 10,
                            total_units_allowed : 1
                        })
                    }).done(function (error, result) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        coupon = result;
                        if (coupon) {
                            coupon.rules = JSON.parse(coupon.rules);
                            coupon.rules.couponProductGroup = couponProductGroup;
                        }

                        callback();
                    });
                },

                function (callback) {
                    var options = {
                            coupon : {code : 'coupon-' + tick}
                        },
                        order = {
                            couponsToBeUsed : [coupon],
                            lineItems : [
                                {
                                    product_id : 1,
                                    variant_id : 1,
                                    catalog_id : 1,
                                    price : 8,
                                    quantity : 2,
                                    u_volume : 100,
                                    q_volume : 100,
                                    r_volume : 100
                                },
                                {
                                    product_id : 2,
                                    variant_id : 2,
                                    catalog_id : 1,
                                    price : 7,
                                    quantity : 1,
                                    u_volume : 100,
                                    q_volume : 100,
                                    r_volume : 100
                                }
                            ]
                        };

                    CouponPlugin.beforeSaveLineItems(context, 'createOrder', options, order, function (error) {
                        expect(error).to.be.not.ok;

                        var lineItem0 = order.lineItems[0],
                            lineItem1 = order.lineItems[1];

                        expect(lineItem0.u_volume).to.equal(95);
                        expect(lineItem0.q_volume).to.equal(95);
                        expect(lineItem0.r_volume).to.equal(95);

                        expect(lineItem1.u_volume).to.equal(100);
                        expect(lineItem1.q_volume).to.equal(100);
                        expect(lineItem1.r_volume).to.equal(100);

                        callback();
                    });
                }
            ], done);            
        });

    });


    describe('onOrderCreated()', function () {
        it('should decrease usage_count of coupons', function (done) {
            var tick = (new Date()).getTime(),
                context,
                coupon;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    context.models.Coupon.create({
                        code : 'coupon-' + tick,
                        active : true,
                        is_single_user : false,
                        usage_count : 2,
                        rules : JSON.stringify({
                            allow_all_products : true,
                            commissionable_percentage : 90,
                            operation : 'percent_off',
                            operation_amount : 10,
                            total_units_allowed : 1
                        })
                    }).done(function (error, result) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        coupon = result;
                        callback();
                        return;
                    });

                },

                function (callback) {
                    var order = {
                            id : 0,
                            couponsToBeUsed : [{id : coupon.id}]
                        };
                    CouponPlugin.onOrderCreated(context, '', {}, order, callback);
                },

                function (callback) {
                    context.models.Coupon.find(coupon.id).done(function (error, coupon) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        expect(coupon.usage_count).to.equal(1);
                        callback();
                    });
                }
            ], done);
        });
    });

});

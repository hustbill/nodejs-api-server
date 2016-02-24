/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var couponHelper = require('../../helpers/couponHelper');
var util = require('util');

var sutPath = '../../../daos/Coupon.js';
var CouponDao = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        memcached : true,
        user : true
    }, callback);
}

function getNormalCouponRules() {
    return {
        allow_all_products : true,
        commissionable_percentage : 0,
        coupon_product_group_id : 0,
        operation : 'percent_off',
        operation_amount : 10,
        total_units_allowed : 1,
        minimal_accumulated_order_total : 0,
        maximal_accumulated_order_total : 0
    };
}

function getNormalCouponRulesText() {
    return JSON.stringify(getNormalCouponRules());
}

function createCouponProductGroup(context, groupProducts, callback) {
    couponHelper.createCouponProductGroup(context, {groupProducts : groupProducts}, callback);
}


describe('daos/Coupon', function () {
    describe('createCoupon()', function () {
        it('should work', function (done) {
            var tick = (new Date()).getTime(),
                createCouponOptions = {
                    code : 'coupon-' + tick,
                    active : true,
                    isSingleUser : false,
                    expiredAt : new Date(tick - 1000),
                    usageCount : 1,
                    rules : {
                        allowAllProducts : true,
                        commissionablePercentage : 0,
                        couponProductGroupId : 0,
                        operation : 'percent_off',
                        operationAmount : 100,
                        totalUnitsAllowed : 1,
                        minimalAccumulatedOrderTotal : 500
                    }
                };

            async.waterfall([
                getContext,

                function (context, callback) {
                    var couponDao = new CouponDao(context);
                    couponDao.createCoupon(createCouponOptions, callback);
                },

                function (newCoupon, callback) {
                    expect(newCoupon).to.be.ok;

                    callback();
                }
            ], done);
        });

    });

    describe('calculateDiscountLineItems()', function () {
        it('should apply to the most expensive products', function (done) {
            var context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var couponDao = new CouponDao(context),
                        coupon = {
                            rules : {
                                allow_all_products : true,
                                total_units_allowed : 2
                            }
                        },
                        order = {
                            lineItems : [
                                {catalog_id : 1, variant_id : 2, price : 7, quantity : 2},
                                {catalog_id : 1, variant_id : 1, price : 8, quantity : 1}
                            ]
                        };

                    couponDao.calculateDiscountLineItems(order, coupon, null, callback);
                },

                function (discountLineItems, callback) {
                    expect(discountLineItems).to.eql([
                        {catalog_id : 1, variant_id : 1, price : 8, quantity : 1},
                        {catalog_id : 1, variant_id : 2, price : 7, quantity : 1}
                    ]);

                    callback();
                }
            ], done);
        });

        it('should skip products not in allowed product group', function (done) {
            var context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var couponDao = new CouponDao(context),
                        coupon = {
                            rules : {
                                allow_all_products : false,
                                total_units_allowed : 2,
                                couponProductGroup : {
                                    groupProducts : [
                                        {catalog_id : 1, product_id : 1},
                                        {catalog_id : 1, product_id : 2}
                                    ]
                                }
                            }
                        },
                        order = {
                            lineItems : [
                                {catalog_id : 1, product_id : 3, variant_id : 3, price : 9, quantity : 2},
                                {catalog_id : 1, product_id : 2, variant_id : 2, price : 7, quantity : 2},
                                {catalog_id : 1, product_id : 1, variant_id : 1, price : 8, quantity : 1}
                            ]
                        };

                    couponDao.calculateDiscountLineItems(order, coupon, null, callback);
                },

                function (discountLineItems, callback) {
                    expect(discountLineItems).to.eql([
                        {catalog_id : 1, variant_id : 1, price : 8, quantity : 1},
                        {catalog_id : 1, variant_id : 2, price : 7, quantity : 1}
                    ]);

                    callback();
                }
            ], done);
        });

        it('should apply coupon to line-items specified in `lineItemsToApply` options', function (done) {
            var context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var couponDao = new CouponDao(context),
                        coupon = {
                            rules : {
                                allow_all_products : false,
                                total_units_allowed : 2,
                                couponProductGroup : {
                                    groupProducts : [
                                        {catalog_id : 1, product_id : 1},
                                        {catalog_id : 1, product_id : 2},
                                        {catalog_id : 1, product_id : 3}
                                    ]
                                }
                            }
                        },
                        order = {
                            lineItems : [
                                {catalog_id : 1, catalog_code : 'SP', product_id : 4, variant_id : 4, price : 10, quantity : 2},
                                {catalog_id : 1, catalog_code : 'SP', product_id : 3, variant_id : 3, price : 9, quantity : 2},
                                {catalog_id : 1, catalog_code : 'SP', product_id : 2, variant_id : 2, price : 7, quantity : 2},
                                {catalog_id : 1, catalog_code : 'SP', product_id : 1, variant_id : 1, price : 8, quantity : 1}
                            ]
                        },
                        lineItemsToApply = [
                            {catalogCode : 'SP', variantId : 1, quantity : 1},
                            {catalogCode : 'SP', variantId : 2, quantity : 1}
                        ];

                    couponDao.calculateDiscountLineItems(order, coupon, lineItemsToApply, callback);
                },

                function (discountLineItems, callback) {
                    expect(discountLineItems).to.eql([
                        {catalog_id : 1, variant_id : 1, price : 8, quantity : 1},
                        {catalog_id : 1, variant_id : 2, price : 7, quantity : 1}
                    ]);

                    callback();
                }
            ], done);
        });

        it('should allow duplicate variant-id in order.lineItems', function (done) {
            var context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var couponDao = new CouponDao(context),
                        coupon = {
                            rules : {
                                allow_all_products : false,
                                total_units_allowed : 2,
                                couponProductGroup : {
                                    groupProducts : [
                                        {catalog_id : 1, product_id : 1},
                                        {catalog_id : 1, product_id : 2},
                                        {catalog_id : 1, product_id : 3}
                                    ]
                                }
                            }
                        },
                        order = {
                            lineItems : [
                                {catalog_id : 1, catalog_code : 'SP', product_id : 1, variant_id : 1, price : 10, quantity : 1},
                                {catalog_id : 1, catalog_code : 'SP', product_id : 1, variant_id : 1, price : 10, quantity : 2}
                            ]
                        },
                        lineItemsToApply = [
                            {catalogCode : 'SP', variantId : 1, quantity : 2},
                        ];

                    couponDao.calculateDiscountLineItems(order, coupon, lineItemsToApply, callback);
                },

                function (discountLineItems, callback) {
                    expect(discountLineItems).to.eql([
                        {catalog_id : 1, variant_id : 1, price : 10, quantity : 1},
                        {catalog_id : 1, variant_id : 1, price : 10, quantity : 1}
                    ]);

                    callback();
                }
            ], done);
        });

    });


    describe('calculateDiscountAmount()', function () {
        it('percent_off', function (done) {
            var context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var couponDao = new CouponDao(context),
                        coupon = {
                            rules : {
                                operation : 'percent_off',
                                operation_amount : 10
                            }
                        },
                        discountLineItems = [
                            {variant_id : 2, price : 8, quantity : 2},
                            {variant_id : 1, price : 7, quantity : 3}
                        ],
                        order = {};

                    couponDao.calculateDiscountAmount(order, discountLineItems, coupon, callback);
                },

                function (discountAmount, callback) {
                    expect(discountAmount).to.equal(3.7);

                    callback();
                }
            ], done);
        });

        it('amount_off', function (done) {
            var context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var couponDao = new CouponDao(context),
                        coupon = {
                            rules : {
                                operation : 'amount_off',
                                operation_amount : 0.1
                            }
                        },
                        discountLineItems = [
                            {variant_id : 2, price : 8, quantity : 2},
                            {variant_id : 1, price : 7, quantity : 3}
                        ],
                        order = {};

                    couponDao.calculateDiscountAmount(order, discountLineItems, coupon, callback);
                },

                function (discountAmount, callback) {
                    expect(discountAmount).to.equal(0.5);

                    callback();
                }
            ], done);
        });

    });


    describe('fillCouponProductGroupProductsForUser()', function () {
        it('should fill products into coupon.rules property', function (done) {
            var context,
                couponDao,
                tick = (new Date()).getTime(),
                createCouponOptions = {
                    code : 'coupon-' + tick,
                    active : true,
                    isSingleUser : false,
                    expiredAt : new Date(tick - 1000),
                    usageCount : 1,
                    rules : {
                        allowAllProducts : true,
                        commissionablePercentage : 0,
                        couponProductGroupId : 0,
                        operation : 'percent_off',
                        operationAmount : 100,
                        totalUnitsAllowed : 1,
                        minimalAccumulatedOrderTotal : 500
                    }
                };

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    couponHelper.createBuyingBonusCoupons(context, callback);
                },

                function (callback) {
                    couponDao = new CouponDao(context);
                    couponDao.getCouponsByCodes(['buying-bonus-one-free-product'], callback);
                },

                function (coupons, callback) {
                    couponDao.fillCouponProductGroupProductsForUser(coupons, context.user.userId, callback);
                }
            ], done);
        });
    });



    describe('validateCouponToUse()', function () {
        it('should callback InvalidCoupon error if try to use a not-exists coupon.', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var couponDao = new CouponDao(context),
                        tick = (new Date()).getTime(),
                        options = {
                            couponCode : 'coupon-' + tick,
                            order : {}
                        };
                    couponDao.validateCouponToUse(options, function (error) {
                        expect(error).to.be.instanceof(Error);

                        callback();
                    });
                }
            ], done);
        });

        it('should callback InvalidCoupon error if try to use an inactive coupon.', function (done) {
            var tick = (new Date()).getTime(),
                context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    context.models.Coupon.create({
                        code : 'coupon-' + tick,
                        active : false,
                        is_single_user : false,
                        usage_count : 1,
                        rules : getNormalCouponRulesText()
                    }).done(function (error) {
                        callback(error);
                    });;
                },

                function (callback) {
                    var couponDao = new CouponDao(context),
                        options = {
                            couponCode : 'coupon-' + tick,
                            order : {}
                        };
                    couponDao.validateCouponToUse(options, function (error) {
                        expect(error).to.be.instanceof(Error);
                        expect(error.errorCode).to.equal('InvalidCoupon');

                        callback();
                    });
                }
            ], done);
        });

        it('should callback InvalidCoupon error if try to use an expired coupon.', function (done) {
            var tick = (new Date()).getTime(),
                context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    context.models.Coupon.create({
                        code : 'coupon-' + tick,
                        active : true,
                        is_single_user : false,
                        expired_at : new Date(tick - 1000),
                        usage_count : 1,
                        rules : getNormalCouponRulesText()
                    }).done(function (error) {
                        callback(error);
                    });;
                },

                function (callback) {
                    var couponDao = new CouponDao(context),
                        options = {
                            couponCode : 'coupon-' + tick,
                            order : {}
                        };
                    couponDao.validateCouponToUse(options, function (error) {
                        expect(error).to.be.instanceof(Error);
                        expect(error.errorCode).to.equal('InvalidCoupon');

                        callback();
                    });
                }
            ], done);
        });

        it('should callback InvalidCoupon error if try to use coupon which is not belong to order.user_id.', function (done) {
            var tick = (new Date()).getTime(),
                context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    context.models.Coupon.create({
                        code : 'coupon-' + tick,
                        active : true,
                        is_single_user : true,
                        user_id : 0,
                        usage_count : 1,
                        rules : getNormalCouponRulesText()
                    }).done(function (error) {
                        callback(error);
                    });;
                },

                function (callback) {
                    var couponDao = new CouponDao(context),
                        options = {
                            couponCode : 'coupon-' + tick,
                            order : {
                                user_id : context.user.userId
                            }
                        };
                    couponDao.validateCouponToUse(options, function (error) {
                        expect(error).to.be.instanceof(Error);
                        expect(error.errorCode).to.equal('InvalidCoupon');

                        callback();
                    });
                }
            ], done);
        });

        it('should callback InvalidCoupon error if try to use a coupon which usage_count is 0.', function (done) {
            var tick = (new Date()).getTime(),
                context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    context.models.Coupon.create({
                        code : 'coupon-' + tick,
                        active : true,
                        is_single_user : false,
                        usage_count : 0,
                        rules : getNormalCouponRulesText()
                    }).done(function (error) {
                        callback(error);
                    });;
                },

                function (callback) {
                    var couponDao = new CouponDao(context),
                        options = {
                            couponCode : 'coupon-' + tick,
                            order : {}
                        };
                    couponDao.validateCouponToUse(options, function (error) {
                        expect(error).to.be.instanceof(Error);
                        expect(error.errorCode).to.equal('InvalidCoupon');

                        callback();
                    });
                }
            ], done);
        });

        it('should callback InvalidCoupon error if try to use a coupon which rules is not set.', function (done) {
            var tick = (new Date()).getTime(),
                context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    context.models.Coupon.create({
                        code : 'coupon-' + tick,
                        active : true,
                        is_single_user : false,
                        usage_count : 1,
                        rules : null
                    }).done(function (error) {
                        callback(error);
                    });
                },

                function (callback) {
                    var couponDao = new CouponDao(context),
                        options = {
                            couponCode : 'coupon-' + tick,
                            order : {}
                        };
                    couponDao.validateCouponToUse(options, function (error) {
                        expect(error).to.be.instanceof(Error);
                        expect(error.errorCode).to.equal('InvalidCoupon');

                        callback();
                    });
                }
            ], done);
        });

        it('should callback InvalidCoupon error if try to use a coupon which is not allowed.', function (done) {
            var tick = (new Date()).getTime(),
                context;

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
                            commissionable_percentage : 0,
                            coupon_product_group_id : couponProductGroup.id,
                            operation : 'percent_off',
                            operation_amount : 10,
                            total_units_allowed : 1
                        })
                    }).done(function (error) {
                        callback(error);
                    });
                },

                function (callback) {
                    var couponDao = new CouponDao(context),
                        options = {
                            couponCode : 'coupon-' + tick,
                            order : {
                                lineItems : [
                                    {product_id : 3, catalog_id : 1}
                                ]
                            }
                        };
                    couponDao.validateCouponToUse(options, function (error) {
                        expect(error).to.be.instanceof(Error);
                        expect(error.errorCode).to.equal('InvalidCoupon');

                        callback();
                    });
                }
            ], done);
        });

        it('should not callback Error if coupon is allowed to use.', function (done) {
            var tick = (new Date()).getTime(),
                context;

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
                            commissionable_percentage : 0,
                            coupon_product_group_id : couponProductGroup.id,
                            operation : 'percent_off',
                            operation_amount : 10,
                            total_units_allowed : 1
                        })
                    }).done(function (error) {
                        callback(error);
                    });
                },

                function (callback) {
                    var couponDao = new CouponDao(context),
                        options = {
                            couponCode : 'coupon-' + tick,
                            order : {
                                lineItems : [
                                    {product_id : 1, catalog_id : 1}
                                ]
                            }
                        };
                    couponDao.validateCouponToUse(options, function (error) {
                        expect(error).to.be.not.ok;

                        callback();
                    });
                }
            ], done);
        });

    });
});


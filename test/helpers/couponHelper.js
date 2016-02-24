var async = require('async');
var daos = require('../../daos');
var DAO = require('../../daos/DAO');

exports.createCouponProductGroup = function(context, options, callback) {
    async.waterfall([
        function (callback) {
            var tick = (new Date()).getTime(),
                productGroup = {
                    name : options.name || 'productGroup-' + tick,
                    type : 'Generic',
                    description : options.description || 'product group ' + tick
                };

            context.models.CouponProductGroup.create(productGroup).done(callback);
        },

        function (productGroup, callback) {
            productGroup.groupProducts = [];

            async.forEachSeries(options.groupProducts || [], function (eachGroupProduct, callback) {
                eachGroupProduct.coupon_product_group_id = productGroup.id;
                context.models.CouponProductGroupProduct.create(eachGroupProduct).done(function (error, newGroupProduct) {
                    if (error) {
                        callback(error);
                        return;
                    }
                    productGroup.groupProducts.push(newGroupProduct);
                    callback();
                });
            }, function (error) {
                callback(error, productGroup);
            });
        }
    ], callback);
};


exports.createBuyingBonusCoupons = function (context, callback) {
    var self = this,
        couponProductGroup;

    async.waterfall([
        function (callback) {
            var options = {
                    groupProducts : [
                        {product_id : 85, catalog_id : 1},
                        {product_id : 133, catalog_id : 1},
                        {product_id : 134, catalog_id : 1},
                        {product_id : 139, catalog_id : 1}
                    ]
                };
            self.createCouponProductGroup(context, options, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                couponProductGroup = result;
                callback();
            });
        },

        function (callback) {
            var queryDatabaseOptions = {
                    useWriteDatabase : true,
                    sqlStmt : "delete from coupons where code in ('buying-bonus-one-free-product', 'buying-bonus-one-60%-off-product', 'buying-bonus-two-free-products', 'buying-bonus-two-60%-off-products')"
                };
            DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                callback(error);
            });
        },

        function (callback) {

            var coupons = [
                    {
                        type : 'Buying Bonus',
                        code : 'buying-bonus-one-free-product',
                        active : true,
                        isSingleUser : false,
                        expiredAt : null,
                        usageCount : 999,
                        rules : {
                            allowAllProducts : false,
                            commissionablePercentage : 0,
                            couponProductGroupId : couponProductGroup.id,
                            operation : 'percent_off',
                            operationAmount : 100,
                            totalUnitsAllowed : 1,
                            minimalAccumulatedOrderTotal : 500,
                            maximalAccumulatedOrderTotal : 1000
                        }
                    },
                    {
                        type : 'Buying Bonus',
                        code : 'buying-bonus-one-60%-off-product',
                        active : true,
                        isSingleUser : false,
                        expiredAt : null,
                        usageCount : 999,
                        rules : {
                            allowAllProducts : false,
                            commissionablePercentage : 0,
                            couponProductGroupId : couponProductGroup.id,
                            operation : 'percent_off',
                            operationAmount : 60,
                            totalUnitsAllowed : 1,
                            minimalAccumulatedOrderTotal : 500,
                            maximalAccumulatedOrderTotal : 1000
                        }
                    },
                    {
                        type : 'Buying Bonus',
                        code : 'buying-bonus-two-free-products',
                        active : true,
                        isSingleUser : false,
                        expiredAt : null,
                        usageCount : 999,
                        rules : {
                            allowAllProducts : false,
                            commissionablePercentage : 0,
                            couponProductGroupId : couponProductGroup.id,
                            operation : 'percent_off',
                            operationAmount : 100,
                            totalUnitsAllowed : 2,
                            minimalAccumulatedOrderTotal : 1000,
                            maximalAccumulatedOrderTotal : -1
                        }
                    },
                    {
                        type : 'Buying Bonus',
                        code : 'buying-bonus-two-60%-off-products',
                        active : true,
                        isSingleUser : false,
                        expiredAt : null,
                        usageCount : 999,
                        rules : {
                            allowAllProducts : false,
                            commissionablePercentage : 0,
                            couponProductGroupId : couponProductGroup.id,
                            operation : 'percent_off',
                            operationAmount : 60,
                            totalUnitsAllowed : 2,
                            minimalAccumulatedOrderTotal : 1000,
                            maximalAccumulatedOrderTotal : -1
                        }
                    }
                ];

            var couponDao = daos.createDao('Coupon', context);
            async.forEachSeries(coupons, function (coupon, callback) {
                couponDao.createCoupon(coupon, callback);
            }, function (error) {
                callback(error);
            });
        }
    ], callback);
};


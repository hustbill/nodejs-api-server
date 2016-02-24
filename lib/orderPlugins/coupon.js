var async = require('async');
var u = require('underscore');
var daos = require('../../daos');
var DAO = require('../../daos/DAO');
var utils = require('../../lib/utils');
var buyingBonusOrderPlugin = require('./buyingBonus.js');

exports.name = 'coupon';


function findLineItem(lineItems, catalog_id, variant_id) {
    var lineItem,
        i;

    for (i = 0; i < lineItems.length; i += 1) {
        lineItem = lineItems[i];
        if (lineItem.catalog_id == catalog_id && lineItem.variant_id == variant_id) {
            return lineItem;
        }
    }

    return null;
}


function decreaseUsageCountOfCoupons(context, coupons, callback) {
    var couponDao = daos.createDao('Coupon', context);

    async.forEachSeries(coupons, function (coupon, callback) {
        couponDao.decreaseUsageCountById(coupon.id, callback);
    }, function (error) {
        callback(error);
    });
}


function findDuplicateCouponToUse(coupons) {
    var couponMapByCode = {},
        coupon,
        i;

    for (i = 0; i < coupons.length; i += 1) {
        coupon = coupons[i];
        if (couponMapByCode[coupon.code]) {
            return coupon;
        }

        couponMapByCode[coupon.code] = true;
    }

    return null;
}


function isShoppingOrder(order) {
    if (!order.lineItems || !order.lineItems.length) {
        return false;
    }

    return order.lineItems[0].catalog_code === 'SP';
}


exports.onValidateOptions = function (context, operation, options, order, callback) {
    var logger = context.logger,
        couponDao,
        duplicateCoupon,
        error;

    order.couponsToBeUsed = [];

    logger.debug("coupon: begin validating %s options", operation);
    if (!options.coupons || !options.coupons.length) {
        logger.debug("coupon: validating finished. no coupon used.");
        callback();
        return;
    }

    if (!isShoppingOrder(order)) {
        error = new Error("Coupons can only be used when shopping.");
        error.statusCode = 403;
        error.errorCode = 'InvalidCoupon';
        callback(error);
        return;
    }

    duplicateCoupon = findDuplicateCouponToUse(options.coupons);
    if (duplicateCoupon) {
        error = new Error("You can not use the same coupon more than once in one order.");
        error.statusCode = 400;
        error.errorCode = 'InvalidCoupon';
        callback(error);
        return;
    }

    couponDao = daos.createDao('Coupon', context);

    async.waterfall([
        function (callback) {
            // validate coupons to use
            async.forEachSeries(options.coupons, function (coupon, callback) {
                logger.debug("coupon: validating if coupon with code '" + coupon.code + "' can be used.");
                var validateCouponOptions = {
                        couponCode : coupon.code,
                        order : order,
                        lineItemsToApply : coupon.lineItems
                    };

                couponDao.validateCouponToUse(validateCouponOptions, function (error, coupon) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (coupon.rules &&
                            coupon.rules.exclusive &&
                            options.coupons.length > 1) {
                        error = new Error("Coupon '" + coupon.name + "' can not be used with other coupon.");
                        error.errorCode = 'InvalidCoupon';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    order.couponsToBeUsed.push(coupon);
                    callback();
                });
            }, function (error) {
                callback(error);
            });
        },

        function (callback) {
            // calculate discount line items for each coupon to be used,
            // because we need to know non-buying-bonus product items total
            // so that we can check `coupon.rules.minimal_accumulated_order_total` and `coupon.rules.maximal_accumulated_order_total` later.
            async.forEachSeries(order.couponsToBeUsed, function (coupon, callback) {
                couponDao.calculateDiscountLineItems(order, coupon, coupon.lineItemsToApply, callback);
            }, function (error) {
                callback(error);
            });
        },

        function (callback) {
            buyingBonusOrderPlugin.getNotBuyingBonusProductsItemTotal(context, options, order, function (error, notBuyingBonusItemTotal) {
                if (error) {
                    callback(error);
                    return;
                }

                async.forEachSeries(order.couponsToBeUsed, function (coupon, callback) {
                    if (coupon === null) {
                        return;
                    }

                    var rules = coupon.rules,
                        available = true,
                        error;

                    if (rules.minimal_accumulated_order_total > 0 && notBuyingBonusItemTotal < rules.minimal_accumulated_order_total) {
                        available = false;
                    }

                    if (rules.maximal_accumulated_order_total > 0 && notBuyingBonusItemTotal >= rules.maximal_accumulated_order_total) {
                        available = false;
                    }

                    if (!available) {
                        error = new Error("Coupon '" + coupon.code + "' can not be used.");
                        error.errorCode = 'InvalidCoupon';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    callback();
                }, function (error) {
                    callback(error);
                });
            });
        }
    ], callback);

};


function decreaseCommissionsOfLineItem(lineItem, discountQuantity, commissionablePercentage, lineItemCommissionTypes) {
    if (discountQuantity === 0) {
        return;
    }

    lineItemCommissionTypes.forEach(function (commissionType) {
        var originalCommissionValue = lineItem['original_' + commissionType] || 0,
            currentCommissionValue = lineItem[commissionType] || 0,
            averageCommission = originalCommissionValue / lineItem.quantity;

        commissionValue = currentCommissionValue - (averageCommission * discountQuantity) + 
            (averageCommission * discountQuantity * commissionablePercentage / 100);
        if (commissionValue < 0) {
            commissionValue = 0;
        }
        lineItem[commissionType] = utils.roundVolume(commissionValue);
    });
}


exports.beforeSaveLineItems = function (context, operation, options, order, callback) {
    var couponDao = daos.createDao('Coupon', context),
        couponsToBeUsed = order.couponsToBeUsed,
        lineItemCommissionTypes = [
            'dt_volume',
            'ft_volume',
            'u_volume',
            'q_volume',
            'r_volume'
        ];

    if (!couponsToBeUsed || !couponsToBeUsed.length) {
        callback();
        return;
    }

    order.lineItems.forEach(function (lineItem) {
        lineItemCommissionTypes.forEach(function (commissionType) {
            lineItem['original_' + commissionType] = lineItem[commissionType];
        });
    });

    async.forEachSeries(couponsToBeUsed, function (coupon, callback) {
        var couponRules = coupon.rules,
            commissionablePercentage = couponRules.commissionable_percentage;

        if (commissionablePercentage === undefined || commissionablePercentage === null) {
            commissionablePercentage = 100;
        }

        if (coupon.type === 'Order') {
            order.lineItems.forEach(function (lineItem) {
                decreaseCommissionsOfLineItem(lineItem, lineItem.quantity, commissionablePercentage, lineItemCommissionTypes);
            });
            callback();
            return;
        }

        async.waterfall([
            function (callback) {
                couponDao.calculateDiscountLineItems(order, coupon, coupon.lineItemsToApply, callback);
            },

            function (discountLineItems, callback) {

                discountLineItems.forEach(function (discountLineItem) {
                    var lineItem = discountLineItem.lineItem,
                        discountQuantity = discountLineItem.quantity || 0;

                    decreaseCommissionsOfLineItem(lineItem, discountQuantity, commissionablePercentage, lineItemCommissionTypes);
                });

                callback();
            }
        ], callback);
    }, function (error) {
        callback(error);
    });
};


exports.onCalculateAdjustments = function (context, operation, options, order, callback) {
    var logger = context.logger,
        couponDao = daos.createDao('Coupon', context),
        couponsToBeUsed = order.couponsToBeUsed,
        couponAdjustments;

    if (!couponsToBeUsed || !couponsToBeUsed.length) {
        logger.debug("coupon: no coupons to be used.");
        callback();
        return;
    }

    logger.debug("coupon: " + couponsToBeUsed.length + " to be used.");
    order.groupedAdjustments.coupon = couponAdjustments = [];
    async.forEachSeries(couponsToBeUsed, function (coupon, callback) {
        async.waterfall([
            function (callback) {
                logger.debug("coupon: calculating discount line items of coupon " + coupon.code);
                couponDao.calculateDiscountLineItems(order, coupon, coupon.lineItemsToApply, callback);
            },

            function (discountLineItems, callback) {
                logger.debug("coupon: calculating discount amount of coupon " + coupon.code);
                couponDao.calculateDiscountAmount(order, discountLineItems, coupon, callback);
            },

            function (discountAmount, callback) {
                logger.debug("coupon: discount amount: " + discountAmount);
                if (!discountAmount) {
                    callback();
                    return;
                }

                var adjustment = {
                        order_id : order.id,
                        amount : discountAmount * -1,
                        label : 'coupon ' + (coupon.name || coupon.description),
                        source_type : 'Order',
                        source_id : order.id,
                        mandatory : false,
                        originator_type : 'Coupon',
                        originator_id : coupon.id
                    };

                couponAdjustments.push(adjustment);
                callback();
            }
        ], callback);
    }, function (error) {
        if (error) {
            order.groupedAdjustments.coupon = [];
        }

        logger.debug("coupon: coupon adjustments: %j", order.groupedAdjustments.coupon);
        callback(error);
    });
};


exports.onSaveAdjustments = function (context, operation, options, order, callback) {
    var logger = context.logger,
        adjustmentDao = daos.createDao('Adjustment', context),
        couponAdjustments = order.groupedAdjustments.coupon;

    if (!couponAdjustments) {
        callback();
        return;
    }

    logger.debug("coupon: saving coupon adjustments...");
    async.forEachSeries(couponAdjustments, function (couponAdjustment, callback) {
        var adjustmentDao = daos.createDao('Adjustment', context),
            adjustment;

        adjustment = {
            order_id : order.id,
            amount : couponAdjustment.amount,
            label : couponAdjustment.label,
            source_type : 'Order',
            source_id : order.id,
            mandatory : false,
            originator_type : couponAdjustment.originator_type,
            originator_id : couponAdjustment.originator_id
        };

        adjustmentDao.createAdjustment(adjustment, function (error, newAdjustment) {
            if (error) {
                callback(error);
                return;
            }

            order.adjustments.push(newAdjustment);
            callback();
        });

    }, function (error) {
        callback(error);
    });
};


exports.afterCheckout = function (context, operation, options, order, callback) {
    if (!isShoppingOrder(order)) {
        callback();
        return;
    }

    order.coupons = options.coupons;

    var couponDao = daos.createDao('Coupon', context),
        getCouponsOptions = {
            userId : order.user_id
        };
    couponDao.getAvailableCouponsForUser(getCouponsOptions, function (error, availableCoupons) {
        if (error) {
            callback(error);
            return;
        }

        order.availableCoupons = (order.availableCoupons || []).concat(availableCoupons || []);
        callback();
    });
};


exports.onOrderCreated = function (context, operation, options, order, callback) {
    order.coupons = options.coupons;

    if (!order.couponsToBeUsed || !order.couponsToBeUsed.length) {
        callback();
        return;
    }

    async.waterfall([
        function (callback) {
            decreaseUsageCountOfCoupons(context, order.couponsToBeUsed, callback);
        },

        function (callback) {
            // save order coupons
            async.forEachSeries(order.couponsToBeUsed, function (coupon, callback) {
                var couponOptions = u.find(options.coupons, function (item) {return item.code === coupon.code;}),
                    orderCouponDetails,
                    queryDatabaseOptions;

                if (!couponOptions) {
                    orderCouponDetails = {};
                } else {
                    orderCouponDetails = {
                        lineItems : couponOptions.lineItems
                    };
                }

                queryDatabaseOptions = {
                    sqlStmt : "insert into orders_coupons (coupon_id, order_id, details, created_at, updated_at) values ($1, $2, $3, now(), now())",
                    sqlParams : [ coupon.id, order.id, JSON.stringify(orderCouponDetails) ]
                };

                DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                    callback(error);
                });
            }, function (error) {
                callback(error);
            });
        }
    ], callback);
};


exports.onGetOrderDetails = function (context, operation, options, order, callback) {
    async.waterfall([
        function (callback) {
            // get order coupons
            var queryDatabaseOptions;

            queryDatabaseOptions = {
                sqlStmt : "select oc.*, c.code, c.description from orders_coupons oc inner join coupons c on oc.coupon_id = c.id where oc.order_id=$1",
                sqlParams : [order.id]
            };
            DAO.queryDatabase(context, queryDatabaseOptions, callback);
        },

        function (result, callback) {
            var rows = result.rows,
                orderCoupons = [];

            rows.forEach(function (row) {
                var orderCouponDetails = {};
                if (row.details) {
                    orderCouponDetails = JSON.parse(row.details);
                }

                orderCoupons.push({
                    code : row.code,
		    description : row.description,
                    lineItems : orderCouponDetails.lineItems
                });
            });

            order.coupons = orderCoupons;
            callback();
        }
    ], callback);
};

var async = require('async');
var u = require('underscore');
var daos = require('../../daos');
var utils = require('../../lib/utils');


exports.name = 'buyingBonus';

function getPluginConfig(context) {
    var orderPluginsConfig = context.config.application.orderPlugins;
    if (!orderPluginsConfig) {
        return null;
    }

    return u.find(orderPluginsConfig, function (pluginConfig) {
        return pluginConfig.name === 'buyingBonus';
    });
}


function getAllBuyingBonusCoupons(context, order, callback) {
    if (order.allBuyingBonusCoupons) {
        callback(null, order.allBuyingBonusCoupons);
        return;
    }

    var couponDao = daos.createDao('Coupon', context),
        buyingBonusConfig = getPluginConfig(context);

    if (!buyingBonusConfig || !buyingBonusConfig.couponType) {
        order.allBuyingBonusCoupons = [];
        callback(null, []);
        return;
    }

    couponDao.getCouponsByType(buyingBonusConfig.couponType, function (error, coupons) {
        if (error) {
            callback(error);
            return;
        }

        order.allBuyingBonusCoupons = coupons;
        callback(null, coupons);
    });
}


function isOrderForDistributor(context, order, callback) {
    async.waterfall([
        function (callback) {
            var orderDao = daos.createDao('Order', context);
            orderDao.getUserOfOrder(order, callback);
        },

        function (user, callback) {
            var userDao = daos.createDao('User', context);
            userDao.getRolesOfUser(user, callback);
        },

        function (roles, callback) {
            if (!roles || !roles.length || roles[0].role_code !== 'D') {
                // not a distributor
                callback(null, false);
                return;
            }

            if (!order.lineItems || !order.lineItems.length || order.lineItems[0].role_code !== 'D') {
                // not an order for distributor
                callback(null, false);
                return;
            }

            callback(null, true);
        }
    ], callback);
}


function isShoppingOrder(order) {
    if (!order.lineItems || !order.lineItems.length) {
        return false;
    }

    return order.lineItems[0].catalog_code === 'SP';
}


function getBuyingBonusCouponsToUse(context, options, order, callback) {
    if (order.buyingBonusCouponsToUse) {
        callback(null, order.buyingBonusCouponsToUse);
        return;
    }

    var buyingBonusConfig = getPluginConfig(context);

    if (!buyingBonusConfig) {
        order.buyingBonusCouponsToUse = [];
        callback(null, []);
        return;
    }

    if (!options.coupons) {
        order.buyingBonusCouponsToUse = [];
        callback(null, []);
        return;
    }

    getAllBuyingBonusCoupons(context, order, function (error, allBuyingBonusCoupons) {
        if (error) {
            callback(error);
            return;
        }

        var buyingBonusCouponsToUse = [];
        options.coupons.forEach(function (coupon) {
            var buyingBonusCoupon = u.find(allBuyingBonusCoupons, function (item) {
                return item.code === coupon.code;
            });
            if (buyingBonusCoupon) {
                buyingBonusCouponsToUse.push(buyingBonusCoupon);
            }
        });

        order.buyingBonusCouponsToUse = buyingBonusCouponsToUse;
        callback(null, buyingBonusCouponsToUse);
    });
}


exports.getNotBuyingBonusProductsItemTotal = function (context, options, order, callback) {
    async.waterfall([
        function (callback) {
            getBuyingBonusCouponsToUse(context, options, order, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            var couponDao = daos.createDao('Coupon', context),
                notBuyingBonusItemTotal = couponDao.calculateNotBuyingBonusProductsItemTotal(order);
            callback(null, notBuyingBonusItemTotal);
        }

    ], callback);
};


exports.onValidateOptions = function (context, operation, options, order, callback) {
    var couponDao = daos.createDao('Coupon', context),
        buyingBonusCouponsToUse = [];

    async.waterfall([
        function (next) {
            getBuyingBonusCouponsToUse(context, options, order, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                buyingBonusCouponsToUse = result;
                if (!buyingBonusCouponsToUse || !buyingBonusCouponsToUse.length) {
                    callback();
                    return;
                } else if (!isShoppingOrder(order)) {
                    error = new Error("Buying bonus coupons can only be used when shopping.");
                    error.statusCode = 403;
                    error.errorCode = 'InvalidCoupon';
                    callback(error);
                    return;
                }

                // we need to make sure the order use is a distributor,
                // if try to use any buying bonus coupon.
                next();
            });
        }
        /*
        ,

        function (callback) {
            // only distributor can use buying bonus coupon
            isOrderForDistributor(context, order, function (error, isForDistributor) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!isForDistributor) {
                    error = new Error("Buying bonus coupon is not allowed to use.");
                    error.errorCode = 'InvalidCoupon';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        }
        */
    ], callback);
};


function isBuyingBonusCouponAvailableToOrder(context, coupon, order, notBuyingBonusItemTotal, callback) {
    if (!coupon ||
            !coupon.active ||
            (coupon.expired_at && (coupon.expired_at < new Date())) ||
            (coupon.is_single_user && coupon.user_id !== order.user_id) ||
            coupon.usage_count <= 0) {
        callback(null, false);
        return;
    }

    var couponRules = coupon.rules,
        available = true;

    if (couponRules.minimal_accumulated_order_total > 0 && notBuyingBonusItemTotal < couponRules.minimal_accumulated_order_total) {
        available = false;
    }

    if (couponRules.maximal_accumulated_order_total > 0 && notBuyingBonusItemTotal >= couponRules.maximal_accumulated_order_total) {
        available = false;
    }

    if (!available) {
        callback(null, false);
        return;
    }

    async.waterfall([
        function (next) {
            // check coupon.rules.countries_allowed
            if (!couponRules.countries_allowed || !couponRules.countries_allowed.length) {
                next();
                return;
            }

            if (!order.shippingAddress || !order.shippingAddress.country_id) {
                callback(null, false);
                return;
            }

            var countryDao = daos.createDao('Country', context);
            countryDao.getCountryById(order.shippingAddress.country_id, function (error, country) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!country || couponRules.countries_allowed.indexOf(country.iso) === -1) {
                    callback(null, false);
                    return;
                }

                next();
            });
        },

        function (next) {
            // check coupon.rules.roles_allowed
            if (!couponRules.roles_allowed || !couponRules.roles_allowed.length) {
                next();
                return;
            }



            // retail
            if(order.roleCode && order.roleCode === 'R'){

                if(couponRules.roles_allowed.indexOf('R') >= 0){
                    next();
                    return;
                }else{
                    callback(null, false);
                    return;
                }

            }

            var userDao = daos.createDao('User', context);
            // distributor
            userDao.isUserInAnyRolesByCode(order.user, couponRules.roles_allowed, function (error, isInRole) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!isInRole) {
                    callback(null, false);
                    return;
                }

                next();
            });
        },

        function (callback) {
            callback(null, true);
        }
    ], callback);
}


exports.afterCheckout = function (context, operation, options, order, callback) {
    if (!isShoppingOrder(order)) {
        callback();
        return;
    }

    var couponDao = daos.createDao('Coupon', context),
        buyingBonusConfig = getPluginConfig(context),
        buyingBonusCoupons = [],
        notBuyingBonusItemTotal = 0;

    if (!buyingBonusConfig) {
        callback();
        return;
    }

    async.waterfall([
        /*
        function (next) {
            isOrderForDistributor(context, order, function (error, isForDistributor) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!isForDistributor) {
                    callback();
                    return;
                }

                next();
            });
        },
        */

        function (callback) {
            if (!buyingBonusConfig.couponType) {
                buyingBonusCoupons = [];
                callback();
                return;
            }

            getAllBuyingBonusCoupons(context, order, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                buyingBonusCoupons = result;
                callback();
            });
        },

        function (callback) {
            notBuyingBonusItemTotal = couponDao.calculateNotBuyingBonusProductsItemTotal(order);

            var availableCoupons = [];
            async.forEachSeries(buyingBonusCoupons, function (coupon, callback) {
                isBuyingBonusCouponAvailableToOrder(context, coupon, order, notBuyingBonusItemTotal, function (error, available) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (available) {
                        availableCoupons.push(coupon);
                    }

                    callback();
                });

            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                order.availableCoupons = (order.availableCoupons || []).concat(availableCoupons);
                couponDao.fillCouponProductGroupProductsForUser(availableCoupons, order.user_id, callback);
            });
        }
    ], callback);
};

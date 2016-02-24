/**
 * Coupon DAO class.
 */

var util = require('util');
var async = require('async');
var u = require('underscore');
var daos = require('./index');
var DAO = require('./DAO.js');
var utils = require('../lib/utils');
var cacheHelper = require('../lib/cacheHelper');
var cacheKey = require('../lib/cacheKey');
var mailService = require('../lib/mailService');

function Coupon(context) {
    DAO.call(this, context);
}

util.inherits(Coupon, DAO);


/*
 *  options = {
 *      active : <Boolean>, required
 *      code : <String>, required
 *      description : <String>, optional
 *      expiredAt : <Date>, optional
 *      isSingleUser : <Boolean>, required
 *      userId : <Integer>, optional
 *      name : <String>, optional
 *      usageCount : <Integer>, required
 *      rules : {
 *          allowAllProducts : <Boolean>,
 *          couponProductGroupId : <Integer>,
 *          operation : <String>,
 *          operationAmount : <Float>,
 *          commissionablePercentage : <Float>,
 *          totalUnitsAllowed : <Integer>,
 *          minimalAccumulatedOrderTotal : <Integer>,
 *          maximalAccumulatedOrderTotal : <Integer>
 *      }
 *  }
 */
Coupon.prototype.createCoupon = function (options, callback) {
    var context = this.context,
        logger = context.logger,
        rules = options.rules,
        coupon,
        error;

    if (!options.code) {
        error = new Error("Coupon code is required.");
        error.errorCode = 'InvalidCouponCode';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (options.isSingleUser && !options.userId) {
        error = new Error("User id is required.");
        error.errorCode = 'InvalidUserId';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!rules) {
        error = new Error("Coupon rules are required.");
        error.errorCode = 'InvalidCouponRules';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!rules.operation) {
        error = new Error("Operation type of coupon is required.");
        error.errorCode = 'InvalidCouponRules';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!rules.operationAmount || rules.operationAmount <= 0) {
        error = new Error("Operation amount of coupon must be great than 0.");
        error.errorCode = 'InvalidCouponRules';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!rules.totalUnitsAllowed || rules.totalUnitsAllowed <= 0) {
        error = new Error("Total units allowed of coupon must be great than 0.");
        error.errorCode = 'InvalidCouponRules';
        error.statusCode = 400;
        callback(error);
        return;
    }

    async.waterfall([
        function (callback) {
            if (rules.allowAllProducts) {
                rules.couponProductGroupId = null;
                callback();
                return;
            }

            var couponProductGroupDao = daos.createDao('CouponProductGroup', context);
            couponProductGroupDao.getById(rules.couponProductGroupId, function (error, couponProductGroup) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!couponProductGroup) {
                    error = new Error("Coupon product group with id " + rules.couponProductGroupId + "does not exist.");
                    error.errorCode = 'InvalidCouponRules';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            var coupon = {
                    active : options.active,
                    type : options.type,
                    code : options.code,
                    description : options.description,
                    expired_at : options.expiredAt,
                    is_single_user : options.isSingleUser,
                    user_id : options.userId,
                    name : options.name,
                    usage_count : options.usageCount,
                    rules : JSON.stringify({
                        allow_all_products : rules.allowAllProducts,
                        coupon_product_group_id : rules.couponProductGroupId,
                        operation : rules.operation,
                        operation_amount : rules.operationAmount,
                        commissionable_percentage : rules.commissionablePercentage,
                        total_units_allowed : rules.totalUnitsAllowed,
                        minimal_accumulated_order_total : rules.minimalAccumulatedOrderTotal,
                        maximal_accumulated_order_total : rules.maximalAccumulatedOrderTotal
                    })
                };

            context.models.Coupon.create(coupon).done(function (error, newCoupon) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, newCoupon);
            });
        }
    ], callback);
};


function deserializeRulesOfCoupon(context, coupon, callback) {
    if (coupon.rules) {
        try {
            coupon.rules = JSON.parse(coupon.rules);
        } catch (ex) {
        }
    }

    if (!coupon.rules || coupon.rules.allow_all_products) {
        callback();
        return;
    }

    var couponProductGroupId = coupon.rules.coupon_product_group_id,
        couponProductGroupDao;
    if (!couponProductGroupId) {
        callback();
        return;
    }

    couponProductGroupDao = daos.createDao('CouponProductGroup', context);
    couponProductGroupDao.getCouponProductGroupDetailsById(couponProductGroupId, function (error, couponProductGroup) {
        if (error) {
            callback(error);
            return;
        }

        coupon.rules.couponProductGroup = couponProductGroup;
        callback();
    });
}


Coupon.prototype.getCouponByCode = function (code, callback) {
    var context = this.context,
        coupon;

    async.waterfall([
        function (callback) {
            context.readModels.Coupon.find({
                where : {code : code}
            }).done(callback);
        },

        function (result, next) {
            coupon = result;

            if (!coupon) {
                callback(null, null);
                return;
            }

            deserializeRulesOfCoupon(context, coupon, next);
        },

        function (callback) {
            callback(null, coupon);
        }
    ], callback);
};


Coupon.prototype.getCouponsByCodes = function (codes, callback) {
    var self = this;

    async.mapSeries(codes, function (code, callback) {
        self.getCouponByCode(code, callback);
    }, callback);
};


Coupon.prototype.getCouponsByType = function (type, callback) {
    var context = this.context,
        coupons;

    async.waterfall([
        function (callback) {
            context.readModels.Coupon.findAll({
                where : {type : type}
            }).done(callback);
        },

        function (result, callback) {
            coupons = result;

            async.forEachSeries(coupons, function (coupon, callback) {
                deserializeRulesOfCoupon(context, coupon, callback);
            }, function (error) {
                callback(error);
            });
        },

        function (callback) {
            callback(null, coupons);
        }
    ], callback);
};


/*
 *  options = {
 *      userId : <Integer>,
 *  }
 */
Coupon.prototype.getAvailableCouponsForUser = function (options, callback) {
    var context = this.context,
        coupons;

    if (!options.type) {
        options.type = 'Product';
    }

    async.waterfall([
        function (callback) {
            var queryDatabaseOptions = {
                    sqlStmt : "select * from coupons where is_single_user = true and user_id = $1 and active = true and (expired_at is null or expired_at > now()) and usage_count != 0",
                    sqlParams : [options.userId]
                };
            DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, result.rows);
            });
        },

        function (result, callback) {
            coupons = result;

            async.forEachSeries(coupons, function (coupon, callback) {
                deserializeRulesOfCoupon(context, coupon, callback);
            }, function (error) {
                callback(error);
            });
        },

        function (callback) {
            callback(null, coupons);
        }
    ], callback);
};



function cloneVariantPrice(variantPrice) {
    if (!variantPrice) {
        return null;
    }

    return {
        role_code : variantPrice.role_code,
        role_name : variantPrice.role_name,
        price : variantPrice.price,
        suggested_price : variantPrice.suggested_price
    };
}

function cloneVariantPrices(variantPrices) {
    if (!variantPrices) {
        return null;
    }

    return variantPrices.map(cloneVariantPrice);
}

function cloneVariantCommission(variantCommission) {
    if (!variantCommission) {
        return null;
    }

    return {
        code : variantCommission.code,
        name : variantCommission.name,
        description : variantCommission.description,
        volume : variantCommission.volume
    };
}

function cloneVariantCommissions(variantCommissions) {
    if (!variantCommissions) {
        return null;
    }

    return variantCommissions.map(cloneVariantCommission);
}

cloneVariantOption = function (variantOption) {
    if (!variantOption) {
        return null;
    }

    return {
        type : variantOption.type,
        name : variantOption.name,
        presentation_type : variantOption.presentation_type,
        presentation_value : variantOption.presentation_value
    };
}

cloneVariantOptions = function (variantOptions) {
    if (!variantOptions) {
        return null;
    }

    return variantOptions.map(cloneVariantOption);
}

function cloneVariant(variant) {
    if (!variant) {
        return null;
    }

    return {
        id : variant.id,
        product_id : variant.product_id,
        name : variant.name,
        description : variant.description,
        is_master : variant.is_master,
        count_on_hand : variant.count_on_hand,
        available_on : variant.available_on,
        sku : variant.sku,
        images : variant.images,
        price : variant.price,
        suggested_price : variant.suggested_price,
        prices : cloneVariantPrices(variant.prices),
        position : variant.position,
        commissions : cloneVariantCommissions(variant.commissions),
        options : cloneVariantOptions(variant.options)
    };
}

function cloneVariants(variants) {
    if (!variants) {
        return null;
    }

    return variants.map(cloneVariant);
}

function cloneProductPersonalizedType(productPersonalizedType) {
    if (!productPersonalizedType) {
        return null;
    }

    return {
        id : productPersonalizedType.id,
        name : productPersonalizedType.name,
        required : productPersonalizedType.required
    };
}

function cloneProductPersonalizedTypes(productPersonalizedTypes) {
    if (!productPersonalizedTypes) {
        return null;
    }

    return productPersonalizedTypes.map(cloneProductPersonalizedType, this);
}


function cloneProduct(product) {
    if (!product) {
        return null;
    }

    return {
        id : product.id,
        taxon_id : product.taxon_id,
        name : product.name,
        description : product.description,
        sku : product.sku,
        price : product.price,
        suggested_price : product.suggested_price,
        images : product.images,
        position : product.position,
        variant_id : product.variant_id,
        variants : cloneVariants(product.variants),
        personalizedTypes : cloneProductPersonalizedTypes(product.personalizedTypes),
        catalogCode : product.catalogCode
    };
}

function cloneProducts(products) {
    if (!products) {
        return null;
    }

    return products.map(cloneProduct);
}


Coupon.prototype.fillCouponProductGroupProductsForUser = function (coupons, userId, callback) {
    var context = this.context,
        logger = context.logger,
        userDao = daos.createDao('User', context),
        user,
        countryId,
        roleId,
        roleCode;

    logger.debug('filling products of coupon product group for user ' + userId);

    async.waterfall([
        function (callback) {
            userDao.getById(userId, callback);
        },

        function (result, callback) {
            user = result;
            userDao.getHomeAddressOfUser(user, callback);
        },

        function (homeAddress, callback) {
            countryId = homeAddress.country_id;
            userDao.getRolesOfUser(user, callback);
        },

        function (roles, callback) {
            roleId = roles && roles.length && roles[0].id;
            roleCode = roles && roles.length && roles[0].role_code;
            callback();
        },

        function (callback) {
            async.forEachSeries(coupons, function (coupon, callback) {
                var productDao,
                    couponProductGroup = coupon.rules && coupon.rules.couponProductGroup,
                    groupProducts = couponProductGroup && couponProductGroup.groupProducts,
                    key,
                    ttl = 900;  // 15 minutes

                if (!groupProducts) {
                    callback();
                    return;
                }

                async.waterfall([
                    function (next) {
                        key = cacheKey.productsOfCouponProductGroupForCountryAndRole(couponProductGroup.id, countryId, roleId);
                        cacheHelper.get(context, key, function (error, products) {
                            if (error) {
                                next();
                                return;
                            }

                            if (!products) {
                                next();
                                return;
                            }

                            couponProductGroup.products = products;
                            callback();
                        });
                    },

                    function (callback) {
                        couponProductGroup.products = [];
                        productDao = daos.createDao('Product', context);
                        async.forEachSeries(groupProducts, function (groupProduct, callback) {
                            var getProductDetailsOptions = {
                                    userId : userId,
                                    productId : groupProduct.product_id,
                                    catalogId : groupProduct.catalog_id,
                                    roleCode : roleCode
                                };
                            productDao.getProductDetailsForUser(getProductDetailsOptions, function (error, product) {
                                if (!error) {
                                    couponProductGroup.products.push(product);
                                }

                                callback();
                            });
                        }, function (error) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            var products = cloneProducts(couponProductGroup.products);
                            cacheHelper.set(context, key, products, ttl, function (error) {
                                callback();
                            });
                        });
                    }
                ], callback);

            }, function (error) {
                callback(error);
            });
        }
    ], callback);
};


Coupon.prototype.containsCouponProductGroupProduct = function (groupProducts, catalog_id, product_id) {
    var product,
        i;

    for (i = 0; i < groupProducts.length; i += 1) {
        product = groupProducts[i];
        if (product.catalog_id == catalog_id && product.product_id == product_id) {
            return true;
        }
    }

    return false;
};


function getNextLineItemToApplyCoupon(lineItems, applyInfo) {
    var lineItem = u.find(lineItems, function (eachItem) {
        return eachItem.catalog_code === applyInfo.catalogCode
            && eachItem.variant_id === applyInfo.variantId
            && eachItem.discountQuantity === 0
            && eachItem.quantity === (applyInfo.quantity - applyInfo.discountQuantity);
    });
    if (lineItem) {
        return lineItem;
    }

    lineItem = u.find(lineItems, function (eachItem) {
        return eachItem.catalog_code === applyInfo.catalogCode
            && eachItem.variant_id === applyInfo.variantId
            && (eachItem.quantity - eachItem.discountQuantity) === (applyInfo.quantity - applyInfo.discountQuantity);
    });
    if (lineItem) {
        return lineItem;
    }

    return u.find(lineItems, function (eachItem) {
        return eachItem.catalog_code === applyInfo.catalogCode
            && eachItem.variant_id === applyInfo.variantId;
    });
}

Coupon.prototype.calculateDiscountLineItems = function (order, coupon, lineItemsToApply, callback) {
    if (coupon.discountLineItems) {
        callback(null, coupon.discountLineItems);
        return;
    }

    if (coupon.type === 'Order') {
        callback(null, []);
        return;
    }

    var self = this,
        context = this.context,
        couponRules = coupon.rules,
        couponProductGroup = couponRules.couponProductGroup,
        unitsAllowed,
        lineItemsAllowedUseCoupon = [],
        discountLineItems = [],
        lineItem,
        i,
        applyQuantity,
        error;

    order.lineItems.forEach(function (lineItem) {
        if (!lineItem.discountQuantity) {
            lineItem.discountQuantity = 0;
        }
        if (couponRules.allow_all_products ||
                self.containsCouponProductGroupProduct(couponProductGroup.groupProducts, lineItem.catalog_id, lineItem.product_id)) {
            lineItemsAllowedUseCoupon.push(lineItem);
        }
    });

    unitsAllowed = parseInt(coupon.rules.total_units_allowed, 10) || 0;
    if (lineItemsToApply && lineItemsToApply.length) {
        // apply coupon to line-items specified by `lineItemsToApply` if it was provided
        lineItemsToApply.forEach(function (lineItemToApply) {
            if (!lineItemToApply.discountQuantity) {
                lineItemToApply.discountQuantity = 0;
            }

            var lineItem = u.find(lineItemsAllowedUseCoupon, function (item) {
                    return item.catalog_code === lineItemToApply.catalogCode &&
                        item.variant_id === lineItemToApply.variantId;
                });

            if (!lineItem) {
                error = new Error("Can't apply coupon to variant " + lineItemToApply.variantId + ". It's not allowed.");
                error.errorCode = 'InvalidCoupon';
                error.statusCode = 400;
                callback(error);
                return;
            }

            if (lineItemToApply.quantity > unitsAllowed) {
                lineItemToApply.quantity = unitsAllowed;
            }

            while (lineItemToApply.discountQuantity < lineItemToApply.quantity) {
                lineItem = getNextLineItemToApplyCoupon(lineItemsAllowedUseCoupon, lineItemToApply);
                if (!lineItem) {
                    break;
                }

                applyQuantity = lineItemToApply.quantity - lineItemToApply.discountQuantity;
                if (applyQuantity >  (lineItem.quantity - lineItem.discountQuantity)) {
                    applyQuantity = (lineItem.quantity - lineItem.discountQuantity);
                }

                if (applyQuantity) {
                    discountLineItems.push({
                        lineItem : lineItem,
                        catalog_id : lineItem.catalog_id,
                        variant_id : lineItem.variant_id,
                        price : lineItem.price,
                        quantity : applyQuantity
                    });

                    lineItem.discountQuantity += applyQuantity;
                    lineItemToApply.discountQuantity += applyQuantity;
                }
            }
        });
    } else {
        // otherwise, apply coupon to the most expensive line-items.

        // sort by lineItem.price desc
        lineItemsAllowedUseCoupon.sort(function (item1, item2) {
            return item2.price - item1.price;
        });

        for (i = 0; i < lineItemsAllowedUseCoupon.length; i += 1) {
            if (unitsAllowed == 0) {
                break;
            }

            lineItem = lineItemsAllowedUseCoupon[i];
            if (!lineItem.discountQuantity) {
                lineItem.discountQuantity = 0;
            }

            applyQuantity = 0;
            if (unitsAllowed >= (lineItem.quantity - lineItem.discountQuantity)) {
                applyQuantity = (lineItem.quantity - lineItem.discountQuantity);
            } else {
                applyQuantity = unitsAllowed;
            }

            if (applyQuantity) {
                discountLineItems.push({
                    lineItem : lineItem,
                    catalog_id : lineItem.catalog_id,
                    variant_id : lineItem.variant_id,
                    price : lineItem.price,
                    quantity : applyQuantity
                });

                lineItem.discountQuantity += applyQuantity;
                if (lineItem.discountQuantity > lineItem.quantity) {
                    lineItem.discountQuantity = lineItem.quantity;
                }
                unitsAllowed -= applyQuantity;
            }
        }
    }

    coupon.discountLineItems = discountLineItems;
    callback(null, discountLineItems);
};


Coupon.prototype.calculateNotBuyingBonusProductsItemTotal = function (order) {
    var itemTotal = 0,
        couponsToBeUsed = order.couponsToBeUsed,
        buyingBonusCouponsToUse = order.buyingBonusCouponsToUse,
        isBuyingBonusCoupon;

    order.lineItems.forEach(function (lineItem) {
        itemTotal = utils.roundMoney(itemTotal + lineItem.price * lineItem.quantity);
    });

    couponsToBeUsed.forEach(function (coupon) {
        var isBuyingBonusCoupon = u.find(buyingBonusCouponsToUse, function (buyingBonusCoupon) {
                return buyingBonusCoupon.code === coupon.code;
            }),
            buyingBonusCouponLineItems;
        if (isBuyingBonusCoupon) {
            buyingBonusCouponLineItems = coupon.discountLineItems;
            if (buyingBonusCouponLineItems && buyingBonusCouponLineItems.length) {
                buyingBonusCouponLineItems.forEach(function (buyingBonusCouponLineItem) {
                    itemTotal = utils.roundMoney(itemTotal - buyingBonusCouponLineItem.price * buyingBonusCouponLineItem.quantity);
                });
            }
        }
    });

    return itemTotal;
};


Coupon.prototype.calculateDiscountAmount = function (order, discountLineItems, coupon, callback) {
    var context = this.context,
        totalAmount = 0,
        couponOperation = coupon.rules.operation,
        couponOperationAmount = coupon.rules.operation_amount;

    if (coupon.type === 'Order') {
        if (couponOperation === 'percent_off') {
            var notBuyingBonusItemTotal = this.calculateNotBuyingBonusProductsItemTotal(order);
            totalAmount = utils.roundMoney(notBuyingBonusItemTotal * couponOperationAmount / 100);
        } else if (couponOperation === 'amount_off') {
            totalAmount = utils.roundMoney(couponOperationAmount);
        } else {
            totalAmount = 0;
        }
    } else {
        discountLineItems.forEach(function (discountLineItem) {
            var eachAmount = 0;
            if (couponOperation === 'percent_off') {
                eachAmount = utils.roundMoney(discountLineItem.price * discountLineItem.quantity * couponOperationAmount / 100);
            } else if (couponOperation === 'amount_off') {
                eachAmount = utils.roundMoney(couponOperationAmount * discountLineItem.quantity);
            } else {
                eachAmount = 0;
            }
            totalAmount += eachAmount;
        });
    }

    callback(null, totalAmount);
}


/*
 *  options = {
 *      couponCode : <String> optional. required if `coupon` is not provided
 *      coupon : <Object> optional. required if `couponCode` is not provided
 *      order : <Object> required
 *      lineItemsToApply : <Array> optional
 *  }
 */
Coupon.prototype.validateCouponToUse = function (options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        order = options.order,
        couponCode = options.couponCode,
        coupon = options.coupon,
        couponDao,
        couponRules,
        error;

    if (!couponCode && !coupon) {
        error = new Error("Coupon code can not be empty.");
        error.errorCode = 'InvalidCoupon';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!order) {
        error = new Error("options.order can not be null.");
        callback(error);
        return;
    }

    couponDao = daos.createDao('Coupon', context);
    async.waterfall([
        function (callback) {
            if (coupon) {
                callback();
                return;
            }

            couponDao.getCouponByCode(couponCode, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                coupon = result;
                callback();
            });
        },

        function (callback) {
            if (!coupon) {
                error = new Error("You can not use this coupon. The code you provided is not recognized.");
                error.errorCode = 'InvalidCoupon';
                error.statusCode = 400;
                callback(error);
                return;
            }

            if (!coupon.active) {
                error = new Error("You can not use this coupon. It's inactive.");
                error.errorCode = 'InvalidCoupon';
                error.statusCode = 400;
                callback(error);
                return;
            }

            if (coupon.expired_at && (coupon.expired_at < new Date())) {
                error = new Error("You can not use this coupon. It's expired.");
                error.errorCode = 'InvalidCoupon';
                error.statusCode = 400;
                callback(error);
                return;
            }

            if (coupon.is_single_user && coupon.user_id !== order.user_id) {
                error = new Error("You can not use this coupon. It belongs to others.");
                error.errorCode = 'InvalidCoupon';
                error.statusCode = 400;
                callback(error);
                return;
            }

            if (coupon.usage_count <= 0) {
                error = new Error("You can not use this coupon. It has reached the usage limitation.");
                error.errorCode = 'InvalidCoupon';
                error.statusCode = 400;
                callback(error);
                return;
            }

            callback();
        },

        function (next) {
            couponRules = coupon.rules;

            if (!couponRules) {
                error = new Error("You can not use this coupon. Rules of this coupon is not set.");
                error.errorCode = 'InvalidCoupon';
                error.statusCode = 400;
                callback(error);
                return;
            }

            next();
        },

        function (next) {
            // check coupon.rules.countries_allowed
            if (!couponRules.countries_allowed || !couponRules.countries_allowed.length) {
                next();
                return;
            }

            if (!order.shippingAddress || !order.shippingAddress.country_id) {
                error = new Error("You can not use this coupon.");
                error.errorCode = 'InvalidCoupon';
                error.statusCode = 400;
                callback(error);
                return;
            }

            var countryDao = daos.createDao('Country', context);
            countryDao.getCountryById(order.shippingAddress.country_id, function (error, country) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!country || couponRules.countries_allowed.indexOf(country.iso) === -1) {
                    error = new Error("You can not use this coupon. It's not allowed in the country you are shipping to.");
                    error.errorCode = 'InvalidCoupon';
                    error.statusCode = 400;
                    callback(error);
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

            var roleOfOrder = order.lineItems.length && order.lineItems[0].role_code,
                isAllowed = couponRules.roles_allowed.indexOf(roleOfOrder) !== -1;

            if (!isAllowed) {
                error = new Error("You can not use this coupon.");
                error.errorCode = 'InvalidCoupon';
                error.statusCode = 400;
                callback(error);
                return;
            }

            next();
        },

        function (next) {
            if (couponRules.allow_all_products) {
                coupon.lineItemsToApply = options.lineItemsToApply;
                callback(null, coupon);
                return;
            }

            var couponProductGroupDao = daos.createDao('CouponProductGroup', context);
            couponProductGroupDao.getCouponProductGroupDetailsById(couponRules.coupon_product_group_id, next);
        },

        function (couponProductGroup, callback) {
            coupon.rules.couponProductGroup = couponProductGroup;

            var canUse = false;
            if (couponProductGroup && couponProductGroup.groupProducts && couponProductGroup.groupProducts.length) {
                // ensure there is at least one product in line-items can apply the coupon
                order.lineItems.forEach(function (lineItem) {
                    if (self.containsCouponProductGroupProduct(couponProductGroup.groupProducts, lineItem.catalog_id, lineItem.product_id)) {
                        canUse = true;
                    }
                });
            }

            if (!canUse) {
                error = new Error("You can not use this coupon. No product in line items can apply this coupon.");
                error.errorCode = 'InvalidCoupon';
                error.statusCode = 400;
                callback(error);
                return;
            }

            coupon.lineItemsToApply = options.lineItemsToApply;
            callback(null, coupon);
        }
    ], callback);
};


Coupon.prototype.decreaseUsageCountById = function (couponId, callback) {
    var context = this.context;

    async.waterfall([
        function (callback) {
            context.models.Coupon.find(couponId).done(callback);
        },

        function (coupon, callback) {
            if (!coupon) {
                var error = new Error("Coupon with id " + couponId + " does not exist.");
                error.statusCode = 404;
                error.errorCode = 'InvalidCouponId';
                callback(error);
                return;
            }

            if (coupon.usage_count === null || coupon.usage_count <= 0) {
                callback();
                return;
            }

            coupon.usage_count -= 1;
            coupon.save(['usage_count']).done(function (error) {
                callback(error);
            });
        }
    ], callback);
};

function sendCouponEmail(options, callback){
    var context = options.context,
        logger = context.logger,
        coupon = options.coupon || {},
        couponCode = options.couponCode,
        recipientEmails = options.recipientEmails,
        mailData = {};

    if (!callback) {
        callback = function() {};
    }

    logger.debug("Sending email of coupon code:%s", couponCode);

    async.waterfall([

        function(callback) {
            logger.debug("Preparing mail data...");

            /*
            {
    "email-subject":  "Become Beauty Discount Coupon",
    "recipient-email":  "test@test.com",
    "coupon-code"  :  "G00004791363",
    "discount"  :  "20%",
    "number-of-products-allowed"  :  16,
    "minimum-purchase-price"  :  5.00,
    "maximum-purchase-price"  :  1629.24,
    "expiration-date"  :  "2014-08-21",
    "description"  :  "ooxx"
}
            */

            if(u.isString(coupon.rules)){
                coupon.rules = JSON.parse(coupon.rules);
            }

            if(!u.isObject(coupon.rules)){
                coupon.rules = {};
            }

            mailData['email-subject'] = 'Coupon';
            mailData['recipient-emails'] = recipientEmails;
            mailData['coupon-code'] = coupon.code || '';
            mailData['image-url'] = coupon.image_url || '';
            mailData.description = coupon.description || '';
            mailData.details = {};
            mailData.details['expiration-date'] = coupon.expired_at;
            mailData.details['number-of-products-allowed'] = coupon.rules.total_units_allowed || '';
            mailData.details['minimum-purchase-price'] = '$' + coupon.rules.minimal_accumulated_order_total || '';
            mailData.details['maximum-purchase-price'] = '$' + coupon.rules.maximal_accumulated_order_total || '';

            if(coupon.rules.operation === 'percent_off'){
                mailData.details.discount =  coupon.rules.operation_amount + '%';
            }else{
                 mailData.details.discount =  '$' + coupon.rules.operation_amount ;
            }
            
            callback();
        },

      

        function(callback) {
            mailService.sendMail(context, 'coupons', mailData, function(error) {
                if (error) {
                    logger.error("Failed to send coupon email: %s", error.message);
                }
                callback();
            });
        }
    ], callback);

}

Coupon.prototype.sendEmailByCouponCode = function(options, callback){
    var context = this.context,
        couponCode = options.couponCode,
        recipientEmail = options.recipientEmail,
        self = this;

    async.waterfall([
        //get coupon
        function(callback){
            self.getCouponByCode(couponCode, callback);
        },
        function(coupon, callback){
            if (!coupon || !coupon.active) {
                var error = new Error("Coupon with code " + couponCode + " does not exist.");
                error.statusCode = 404;
                error.errorCode = 'InvalidCouponCode';
                callback(error);
                return;
            }

            callback(null, coupon);
        },
        function(coupon, callback){
            options.coupon = coupon;
            options.context = context;
            sendCouponEmail(options);
            callback(null, options);
        }
    ], callback);

};


module.exports = Coupon;


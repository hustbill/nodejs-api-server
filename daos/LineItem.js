/**
 * LineItem DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var daos = require('./index.js');

function LineItem(context) {
    DAO.call(this, context);
}

util.inherits(LineItem, DAO);


LineItem.prototype.setTaxAmountOfLineItem = function (lineItem, taxAmount, callback) {
    lineItem.tax_amount = taxAmount;

    lineItem.save(['tax_amount']).success(function () {
        callback();
    }).error(callback);
};


LineItem.prototype.getVariantOfLineItem = function (user, lineItem, callback) {
    if (lineItem.variant) {
        callback(null, lineItem.variant);
        return;
    }

    var context = this.context,
        variantDao = daos.createDao('Variant', context),
        getVariantDetailOptions = {
            user : user,
            variantId : lineItem.variantId,
            catalogCode : lineItem.catalogCode
        };
    variantDao.getVariantDetailForUser(getVariantDetailOptions, callback);
};


LineItem.prototype.getNonFreeShippingItems = function (user, lineItems, callback) {
    var self = this,
        context = this.context,
        nonFreeShippingItems = [];

    async.forEachSeries(lineItems, function (eachLineItem, callback) {
        async.waterfall([
            function (callback) {
                self.getVariantOfLineItem(user, eachLineItem, callback);
            },

            function (variant, callback) {
                var shippingCategoryDao = daos.createDao('ShippingCategory', context);
                shippingCategoryDao.getShippingCategoryById(variant.shipping_category_id, callback);
            },

            function (shippingCategory, callback) {
                if (!shippingCategory ||
                        (shippingCategory.name !== 'Free Shipping' && shippingCategory.name !== 'No Shipping')) {
                    nonFreeShippingItems.push(eachLineItem);
                }

                callback();
            }
        ], callback);
    }, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, nonFreeShippingItems);
    });
};


function getShippingItemCount(context, lineItem, callback) {
    async.waterfall([
        function (callback) {
            var productBomDao = daos.createDao('ProductBom', context);
            productBomDao.getProductBomsByVariantId(lineItem.variant_id, callback);
        },

        function (productBoms, callback) {
            if (productBoms.length === 0) {
                callback(null, lineItem.quantity);
                return;
            }

            var count = 0;
            productBoms.forEach(function (productBom) {
                if (productBom.shippingfeeapplicable) {
                    count += productBom.bomqty * lineItem.quantity;
                }
            });

            callback(null, count);
        }
    ], callback);
}


LineItem.prototype.getNonFreeShippingItemsCount = function (user, lineItems, callback) {
    var self = this,
        context = this.context;

    async.waterfall([
        function (callback) {
            self.getNonFreeShippingItems(user, lineItems, callback);
        },

        function (nonFreeShippingItems, callback) {
            var itemsCount = 0;

            async.forEachSeries(nonFreeShippingItems, function (eachLineItem, callback) {
                getShippingItemCount(context, eachLineItem, function (error, count) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    itemsCount += count;
                    callback();
                });
            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, itemsCount);
            });
        }
    ], callback);
};


LineItem.prototype.deleteLineItemsByOrderId = function (orderId, callback) {
    var context = this.context,
        queryDatabaseOptions = {
            useWriteDatabase : true,
            sqlStmt : "DELETE FROM line_items WHERE order_id = $1",
            sqlParams : [orderId]
        };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
        callback(error);
    });
};


module.exports = LineItem;

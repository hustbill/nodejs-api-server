/**
 * InventoryUnit DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var daos = require('./index.js');

function InventoryUnit(context) {
    DAO.call(this, context);
}

util.inherits(InventoryUnit, DAO);


function increaseInventoryUnit(context, order, variantId, quantity, shipmentId, callback) {
    var inventoryUnitModel = context.models.InventoryUnit;

    async.timesSeries(quantity, function (n, callback) {
        var inventoryUnit = {
            order_id : order.id,
            variant_id : variantId,
            state : 'sold',
            lock_version : 0,
            shipment_id : shipmentId
        };
        inventoryUnitModel.create(inventoryUnit).done(callback);
    }, function (error) {
        callback(error);
    });
}


InventoryUnit.prototype.assignOpeningInventory = function (order, callback) {
    var context = this.context,
        logger = context.logger;

    logger.debug("Assign opening inventory...");
    if (!order.completed_at) {
        logger.warn("Abort: order not completed.");
        callback();
        return;
    }

    async.waterfall([
        function (callback) {
            var orderDao = daos.createDao('Order', context);
            orderDao.getShipmentsOfOrder(order, callback);
        },

        function (shipments, callback) {
            // get shipment id that is not shipped
            var i,
                len = shipments.length,
                shipment;

            for (i = 0; i < len; i += 1) {
                shipment = shipments[i];
                if (!shipment.shipped_at) {
                    callback(null, shipment.id);
                    return;
                }
            }

            callback(null, null);
        },

        function (shipmentId, callback) {
            if (!shipmentId) {
                callback();
                return;
            }

            async.forEachSeries(order.lineItems, function (lineItem, callback) {
                increaseInventoryUnit(context, order, lineItem.variant_id, lineItem.quantity, shipmentId, callback);
            }, function (error) {
                callback(error);
            });
        }
    ], callback);
};


function getAvailableInventoryUnitToReturn(inventoryUnits, variantId) {
    var inventoryUnit,
        i,
        length = inventoryUnits.length;

    for (i = 0; i < length; i += 1) {
        inventoryUnit = inventoryUnits[i];

        if (!inventoryUnit.return_authorization_id && inventoryUnit.variant_id === variantId) {
            return inventoryUnit;
        }
    }

    return null;
}

/*
 *  options = {
 *      returnAuthorizationId : <Integer>,
 *      orderId : <Integer>,
 *      lineItems : <Array>
 *  }
 */
InventoryUnit.prototype.aquireReturn = function (options, callback) {
    var context = this.context,
        logger = this.logger,
        inventoryUnits;

    async.waterfall([
        function (callback) {
            var queryDatabaseOptions = {
                    useWriteDatabase : true,
                    sqlStmt : "update inventory_units set return_authorization_id = null where return_authorization_id = $1 and state = 'authorized'",
                    sqlParams : [options.returnAuthorizationId]
                };

            DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                callback(error);
            });
        },

        function (callback) {
            context.models.InventoryUnit.findAll({
                where : { order_id : options.orderId }
            }).done(function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                inventoryUnits = result;
                callback();
            });
        },

        function (callback) {
            async.forEachSeries(options.lineItems, function (lineItem, callback) {
                async.timesSeries(lineItem.quantity || 0, function (n, callback) {
                    var inventoryUnitToReturn = getAvailableInventoryUnitToReturn(inventoryUnits, lineItem.variantId);
                    if (!inventoryUnitToReturn) {
                        callback();
                        return;
                    }

                    inventoryUnitToReturn.return_authorization_id = options.returnAuthorizationId;
                    inventoryUnitToReturn.save(['return_authorization_id']).done(function (error) {
                        callback(error);
                    });
                }, function (error) {
                    callback(error);
                });
            }, function (error) {
                callback(error);
            });
        }
    ], callback);
};


InventoryUnit.prototype.getInventoryUnitsByOrderId = function (orderId, callback) {
    var context = this.context;

    context.readModels.InventoryUnit.findAll({
        where : { order_id : orderId }
    }).done(callback);
};


module.exports = InventoryUnit;

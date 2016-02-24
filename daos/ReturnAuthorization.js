/**
 * ReturnAuthorization DAO class.
 */

var u = require('underscore');
var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var daos = require('./index');

function ReturnAuthorization(context) {
    DAO.call(this, context);
}

util.inherits(ReturnAuthorization, DAO);


function getReturnAuthorizationsByOrderId(context, orderId, callback) {
    var logger = context.logger;

    logger.debug('getting return authorization by order id %d', orderId);

    async.waterfall([
        function (callback) {
            context.models.ReturnAuthorization.findAll({
                where : { order_id : orderId },
                order : 'id'
            }).done(callback);
        }
    ], callback);
}

function updateStateOfOrder(context, orderId, callback) {
    var state;

    async.waterfall([
        function (callback) {
            getReturnAuthorizationsByOrderId(context, orderId, callback);
        },

        function (returnAuthorizations, callback) {
            state = 'complete';

            var orderDao = daos.createDao('Order', context),
                returnAuthorization,
                i,
                cancelledCount = 0,
                receivedCount = 0;

            for (i = 0; i < returnAuthorizations.length; i += 1) {
                returnAuthorization = returnAuthorizations[i];

                if (returnAuthorization.state === 'authorized') {
                    state = 'awaiting_return';
                    break;
                } else if (returnAuthorization.state === 'received') {
                    receivedCount += 1;
                } else if (returnAuthorization.state === 'cancelled') {
                    cancelledCount += 1;
                }
            }

            if (returnAuthorizations.length
                    && (returnAuthorizations.length - cancelledCount) === receivedCount) {
                state = 'returned';
            }

            orderDao.updateOrderState({orderId : returnAuthorization.order_id, state: state}, callback);
        }
    ], callback);
}


ReturnAuthorization.prototype.getLastReturnAuthorizationByOrderId = function (orderId, callback) {
    var context = this.context,
        logger = context.logger;

    logger.debug("getting last return authorization by order id %d", orderId);

    context.readModels.ReturnAuthorization.find({
        where : { order_id : orderId },
        order : 'id desc'
    }).done(callback);
};


ReturnAuthorization.prototype.getNextReturnAuthorizationNumberOfOrder = function (order, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        rmaNumber;

    logger.debug("getting next return authorization number of order %d", order.id);
    async.waterfall([
        function (callback) {
            self.getLastReturnAuthorizationByOrderId(order.id, callback);
        },

        function (lastReturnAuthorization, callback) {
            var lastNumber;

            if (!lastReturnAuthorization) {
                lastNumber = 0;
            } else {
                lastNumber = parseInt(lastReturnAuthorization.number.substr(lastReturnAuthorization.number.length - 3), 10);
            }
            lastNumber += 1;

            rmaNumber = "RMA-" + order.number + "-";
            u.times(3 - lastNumber.toString().length, function () {
                rmaNumber += '0';
            });
            rmaNumber += lastNumber;

            callback(null, rmaNumber);
        }
    ], callback);
};


ReturnAuthorization.prototype.createReturnAuthorization = function (returnAuthorization, callback) {
    var context = this.context,
        logger = context.logger;

    returnAuthorization.state = 'authorized';
    returnAuthorization.enter_by = context.user.userId;
    returnAuthorization.enter_at = new Date();

    logger.debug("saving return authorization...");
    context.models.ReturnAuthorization.create(returnAuthorization).done(callback);
};


/*
 *  options = {
 *      returnAuthorizationId : <Integer>,
 *      amount : <Float>,
 *      lineItems : <Array>,
 *  }
 */
ReturnAuthorization.prototype.updateReturnAuthorization = function (options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        returnAuthorizationId = options.returnAuthorizationId,
        returnAuthorization,
        error;

    logger.debug('begin update return authorization by id %d', returnAuthorizationId);

    if (!returnAuthorizationId) {
        error = new Error('return authorization id is required.');
        error.errorCode = 'InvalidReturnAuthorizationId';
        callback(error);
        return;
    }

    async.waterfall([
        function (callback) {
            self.models.ReturnAuthorization.find(returnAuthorizationId).done(callback);
        },

        function (result, callback) {
            returnAuthorization = result;

            if (!returnAuthorization) {
                error = new Error("return authorization with id " + returnAuthorizationId + " does not exist.");
                error.errorCode = 'InvalidReturnAuthorizationId';
                callback(error);
                return;
            }

            if (returnAuthorization.state !== 'authorized') {
                error = new Error("can not update a return-authorization that is not authorized.");
                error.errorCode = 'OperationDenied';
                callback(error);
                return;
            }

            callback();
        },

        function (callback) {
            returnAuthorization.amount = options.amount;
            returnAuthorization.reason = options.reason;
            returnAuthorization.save(['amount', 'reason']).done(function (error) {
                callback(error);
            });
        },

        function (callback) {
            if (!options.lineItems || !options.lineItems.length) {
                callback();
                return;
            }

            var inventoryUnitDao = daos.createDao('InventoryUnit', context),
                aquireReturnOptions = {
                    returnAuthorizationId : options.returnAuthorizationId,
                    orderId : returnAuthorization.order_id,
                    lineItems : options.lineItems
                };

            inventoryUnitDao.aquireReturn(aquireReturnOptions, function (error) {
                callback(error);
            });
        },

        function (callback) {
            callback(null, returnAuthorization);
        }
    ], callback);
};


ReturnAuthorization.prototype.cancelReturnAuthorization = function (returnAuthorizationId, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        returnAuthorization,
        error;

    logger.debug('begin cancel return authorization by id %d', returnAuthorizationId);

    if (!returnAuthorizationId) {
        error = new Error('return authorization id is required.');
        error.errorCode = 'InvalidReturnAuthorizationId';
        callback(error);
        return;
    }

    async.waterfall([
        function (callback) {
            self.models.ReturnAuthorization.find(returnAuthorizationId).done(callback);
        },

        function (result, next) {
            returnAuthorization = result;

            if (!returnAuthorization) {
                error = new Error("return authorization with id " + returnAuthorizationId + " does not exist.");
                error.errorCode = 'InvalidReturnAuthorizationId';
                callback(error);
                return;
            }

            if (returnAuthorization.state === 'cancelled') {
                callback();
                return;
            }

            if (returnAuthorization.state === 'received') {
                error = new Error("can not cancel a received return-authorization.");
                error.errorCode = 'OperationDenied';
                callback(error);
                return;
            }

            returnAuthorization.state = 'cancelled';
            returnAuthorization.save(['state']).done(function (error) {
                next(error);
            });
        },

        function (callback) {
            var queryDatabaseOptions = {
                    useWriteDatabase : true,
                    sqlStmt : "update inventory_units set return_authorization_id = null where return_authorization_id = $1",
                    sqlParams : [returnAuthorizationId]
                };

            DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                callback(error);
            });
        },

        function (callback) {
            updateStateOfOrder(context, returnAuthorization.order_id, callback);
        }
    ], callback);
};


ReturnAuthorization.prototype.receiveReturnAuthorization = function (returnAuthorizationId, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        orderDao = daos.createDao('Order', context),
        returnAuthorization,
        error;

    logger.debug('begin receive return authorization by id %d', returnAuthorizationId);

    async.waterfall([
        function (callback) {
            self.models.ReturnAuthorization.find(returnAuthorizationId).done(callback);
        },

        function (result, next) {
            returnAuthorization = result;

            if (!returnAuthorization) {
                error = new Error("return authorization with id " + returnAuthorizationId + " does not exist.");
                error.errorCode = 'InvalidReturnAuthorizationId';
                callback(error);
                return;
            }

            if (returnAuthorization.state === 'received') {
                callback();
                return;
            }

            if (returnAuthorization.state === 'cancelled') {
                error = new Error("can not receive a cancelled return-authorization.");
                error.errorCode = 'OperationDenied';
                callback(error);
                return;
            }

            returnAuthorization.state = 'received';
            returnAuthorization.save(['state']).done(function (error) {
                next(error);
            });
        },

        function (callback) {
            var queryDatabaseOptions = {
                    useWriteDatabase : true,
                    sqlStmt : "update inventory_units set state = 'returned' where return_authorization_id = $1",
                    sqlParams : [returnAuthorizationId]
                };

            DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                callback(error);
            });
        },

        function (callback) {
            var addOrderAdjustmentOptions = {
                    orderId : returnAuthorization.order_id,
                    label : 'return',
                    amount : returnAuthorization.amount * -1
                };
            orderDao.addOrderAdjustment(addOrderAdjustmentOptions, function (error) {
                callback(error);
            });
        },

        function (callback) {
            updateStateOfOrder(context, returnAuthorization.order_id, callback);
        }
    ], callback);
};


ReturnAuthorization.prototype.getReturnAuthorizationsByOrderId = function (orderId, callback) {
    getReturnAuthorizationsByOrderId(this.context, orderId, callback);
};


ReturnAuthorization.prototype.validateReturnAuthorizationLineItems = function (orderId, lineItems, callback) {
    var error;

    if (!lineItems || !lineItems.length) {
        error = new Error("Line items are required.");
        error.errorCode = 'InvalidLineItems';
        error.statusCode = 400;
        callback(error);
        return;
    }

    callback();
};


module.exports = ReturnAuthorization;

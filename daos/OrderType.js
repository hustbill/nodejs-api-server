/**
 * OrderType DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function OrderType(context) {
    DAO.call(this, context);
}

util.inherits(OrderType, DAO);

var isLoading = false;
var isLoaded = false;
var orderTypeMapById = {};
var orderTypeMapByName = {};
var orderTypeMapByCode = {};
var orderTypeArray = [];
var loadOrderTypeDataCallbacks = [];

function isOrderTypeDataLoaded() {
    return isLoaded;
}

function loadOrderTypeData(callback) {
    if (isLoaded) {
        callback();
        return;
    }

    loadOrderTypeDataCallbacks.push(callback);
    if (isLoading) {
        return;
    }
    isLoading = true;

    var self = this;

    async.waterfall([
        function (next) {
            var options;

            options = {
                sqlStmt: 'SELECT * FROM order_types'
            };
            self.queryDatabase(options, next);
        },

        function (result, next) {
            var orderTypes = result.rows;
            orderTypes.forEach(function (orderType) {
                orderTypeMapById[orderType.id] = orderType;
                orderTypeMapByName[orderType.name] = orderType;
                orderTypeMapByCode[orderType.order_type_code] = orderType;
                orderTypeArray.push(orderType);
            });

            isLoaded = true;
            next();
        }
    ], function (error) {
        // Set the `isLoading` flag as `false` whatever we loaded success or fail.
        isLoading = false;

        // If error occurred, `loadOrderTypeData` maybe called more than one time.
        // So we must reset `loadOrderTypeDataCallbacks` here.
        var callbacks = loadOrderTypeDataCallbacks;
        loadOrderTypeDataCallbacks = [];

        callbacks.forEach(function (eachCallback) {
            if (error) {
                eachCallback(error);
            } else {
                eachCallback();
            }
        });
    });
}

function getEntryByKey(entryMap, key, callback) {
    if (isOrderTypeDataLoaded()) {
        callback(null, entryMap[key]);
        return;
    }

    loadOrderTypeData.call(this, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, entryMap[key]);
        return;
    });
}

OrderType.prototype.getAllOrderTypes = function (callback) {
    if (isOrderTypeDataLoaded()) {
        callback(null, orderTypeArray);
        return;
    }

    loadOrderTypeData.call(this, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, orderTypeArray);
        return;
    });
};

OrderType.prototype.getOrderTypeById = function (orderTypeId, callback) {
    getEntryByKey.call(this, orderTypeMapById, orderTypeId, callback);
};

OrderType.prototype.getOrderTypeByName = function (orderTypeName, callback) {
    getEntryByKey.call(this, orderTypeMapByName, orderTypeName, callback);
};

OrderType.prototype.getOrderTypeByCode = function (orderTypeCode, callback) {
    getEntryByKey.call(this, orderTypeMapByCode, orderTypeCode, callback);
};

module.exports = OrderType;

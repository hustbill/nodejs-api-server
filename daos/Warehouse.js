/**
 * Warehouse DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var daos = require('./index.js');

function Warehouse(context) {
    DAO.call(this, context);
}

util.inherits(Warehouse, DAO);


Warehouse.prototype.getWarehousesInZones = function (zoneIds, callback) {
    if (!zoneIds) {
        zoneIds = [];
    }

    var logger = this.logger;

    logger.debug('Getting warehouses in zones %s', zoneIds);
    this.readModels.Warehouse.findAll({
        where: {zone_id : zoneIds}
    }).success(function (warehouses) {
        logger.debug('%d warehouses founded.', warehouses.length);
        callback(null, warehouses);
    }).error(callback);
};


Warehouse.prototype.getAddressOfWarehouse = function (warehouse, callback) {
    if (warehouse.address) {
        callback(null, warehouse.address);
        return;
    }

    var context = this.context,
        addressDao = daos.createDao('Address', context);

    async.waterfall([
        function (callback) {
            addressDao.getAddressById(warehouse.address_id, callback);
        },

        function (address, callback) {
            warehouse.address = address;
            callback(null, address);
        }
    ], callback);
};

module.exports = Warehouse;

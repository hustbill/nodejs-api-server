/**
 * ShipmentMethod DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var daos = require('./index');

function ShippingMethod(context) {
    DAO.call(this, context);
}

util.inherits(ShippingMethod, DAO);


ShippingMethod.prototype.getShippingAddressesOfShippingMethod = function (shippingMethod, callback) {
    if (shippingMethod.shippingAddresses) {
        callback(null, shippingMethod.shippingAddresses);
        return;
    }

    var context = this.context;

    async.waterfall([
        function (callback) {
            context.readModels.PickupLocation.findAll({
                where : {shipping_method_id : shippingMethod.id}
            }).done(callback);
        },

        function (pickupLocations, callback) {
            var addressDao = daos.createDao('Address', context),
                addressIds = pickupLocations.map(function (pickupLocation) {
                    return pickupLocation.address_id;
                });

            addressDao.getAddressesById(addressIds, function (error, addresses) {
                if (error) {
                    callback(error);
                    return;
                }

                shippingMethod.shippingAddresses = addresses;
                callback(null, addresses);
            });
        }
    ], callback);
};


ShippingMethod.prototype.getShippingMethodById = function (shippingMethodId, callback) {
    var self = this;

    async.waterfall([
        function (callback) {
            self.getById(shippingMethodId, callback);
        },

        function (shippingMethod, callback) {
            shippingMethod.shippingAddressChangeable = (shippingMethod.name.indexOf('Pick') === -1);

            if (shippingMethod.shippingAddressChangeable) {
                callback(null, shippingMethod);
                return;
            }

            self.getShippingAddressesOfShippingMethod(shippingMethod, function (error) {
                callback(error, shippingMethod);
            });
        }
    ], callback);
};


ShippingMethod.prototype.getShippingMethodsInZones = function (zoneIds, callback) {
    if (!zoneIds) {
        zoneIds = [];
    }

    var self = this,
        context = this.context,
        logger = this.logger;

    async.waterfall([
        function (callback) {
            logger.debug('Getting shipping methods in zones %s', zoneIds);
            context.readModels.ShippingMethod.findAll({
                where: "zone_id IN (" + zoneIds.concat(['NULL']).join(",") + ") AND (display_on IS NULL OR display_on != 'none')"
            }).success(function (shippingMethods) {
                logger.debug('%d shipping methods founded.', shippingMethods.length);
                callback(null, shippingMethods);
            }).error(callback);
        },

        function (shippingMethods, callback) {
            async.forEachSeries(shippingMethods, function (shippingMethod, callback) {
                shippingMethod.shippingAddressChangeable = (shippingMethod.name.indexOf('Pick') === -1);

                if (shippingMethod.shippingAddressChangeable) {
                    callback();
                    return;
                }

                self.getShippingAddressesOfShippingMethod(shippingMethod, function (error) {
                    callback(error);
                });
            }, function (error) {
                callback(error, shippingMethods);
            });
        }
    ], callback);
};

module.exports = ShippingMethod;

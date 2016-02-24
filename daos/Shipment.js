/**
 * Shipment DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function Shipment(context) {
    DAO.call(this, context);
}

util.inherits(Shipment, DAO);


Shipment.prototype.createShipment = function (order, shipment, callback) {
    shipment.order_id = order.id;
    // TODO: query db about shipments count of an order
    shipment.number = 'H-' + order.number + '-001';
    shipment.state = 'pending';

    // save shipment record
    this.models.Shipment.create(shipment).success(function (newShipment) {
        callback(null, newShipment);
    }).error(callback);
};



Shipment.prototype.getShipmentsOfOrder = function (orderId, callback) {
    this.readModels.Shipment.findAll({
        where: {order_id : orderId}
    }).success(function (shipments) {
        callback(null, shipments);
    }).error(callback);
};


Shipment.prototype.getShipmentByOrderIdAndShippingMethodId = function (orderId, shippingMethodId, callback) {
    this.readModels.Shipment.find({
        where: {
            order_id : orderId,
            shipping_method_id : shippingMethodId
        }
    }).success(function (shipment) {
        callback(null, shipment);
    }).error(callback);
};


Shipment.prototype.updateStateOfShipment = function (shipment, state, callback) {
    if (shipment.state === state) {
        callback();
        return;
    }

    var logger = this.context.logger;

    logger.debug("Updating state of shipment %d from %s to %s",
            shipment.id,
            shipment.state,
            state);

    shipment.state = state;
    shipment.save(['state']).success(function () {
        callback();
    }).error(callback);
};


Shipment.prototype.clearShipmentsByOrderId = function (orderId, callback) {
    var sqlStmt = "DELETE FROM shipments WHERE order_id = $1",
        sqlParams = [orderId];
    this.databaseClient.query(sqlStmt, sqlParams, function (error) {
        callback(error);
    });
};


module.exports = Shipment;

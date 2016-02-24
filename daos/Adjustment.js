/**
 * Adjustment DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function Adjustment(context) {
    DAO.call(this, context);
}

util.inherits(Adjustment, DAO);


Adjustment.prototype.createAdjustment = function (adjustment, callback) {
    this.models.Adjustment.create(adjustment).success(function (newAdjustment) {
        callback(null, newAdjustment);
    }).error(callback);
};


Adjustment.prototype.clearAdjustmentsByOrderId = function (orderId, callback) {
    var sqlStmt = "DELETE FROM adjustments WHERE order_id = $1",
        sqlParams = [orderId];
    this.databaseClient.query(sqlStmt, sqlParams, function (error) {
        callback(error);
    });
};


Adjustment.prototype.getAdjustmentsOfOrder = function (orderId, callback) {
    this.readModels.Adjustment.findAll({
        where: {order_id : orderId}
    }).success(function (adjustments) {
        callback(null, adjustments);
    }).error(callback);
};

module.exports = Adjustment;

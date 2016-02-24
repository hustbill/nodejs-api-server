/**
 * AutoshipPayment DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function AutoshipPayment(context) {
    DAO.call(this, context);
}

util.inherits(AutoshipPayment, DAO);


AutoshipPayment.prototype.getActivePaymentByAutoshipId = function (autoshipId, callback) {
    var context = this.context;

    async.waterfall([
        function (callback) {
            context.readModels.AutoshipPayment.find({
                where : {
                    autoship_id : autoshipId,
                    active : true
                }
            }).done(callback);
        }
    ], callback);

};

module.exports = AutoshipPayment;

/**
 * OrderBatch DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function OrderBatch(context) {
    DAO.call(this, context);
}

util.inherits(OrderBatch, DAO);


function getLastOrderBatch(context, callback) {
    context.models.OrderBatch.find({
        order : "id desc"
    }).done(callback);
}

function getFirstOrder(context, callback) {
    context.models.Order.find({
        order : "id"
    }).done(callback);
}


OrderBatch.prototype.newOrderBatch = function (callback) {
    var context = this.context,
        logger = context.logger;

    async.waterfall([
        function (callback) {
            getLastOrderBatch(context, callback);
        },

        function (lastOrderBatch, callback) {
            if (lastOrderBatch) {
                callback(null, lastOrderBatch.end_date);
                return;
            }

            getFirstOrder(context, function (error, firstOrder) {
                if (firstOrder) {
                    callback(null, firstOrder.updated_at);
                    return;
                }
                
                callback(null, new Date());
            });
        },

        function (startDate, callback) {
            var orderBatch = {
                client_id : context.clientId,
                request_ip : context.remoteAddress,
                start_date : startDate,
                end_date : new Date(),
                active : true
            }

            context.models.OrderBatch.create(orderBatch).done(callback);
        }
    ], callback);
};

module.exports = OrderBatch;

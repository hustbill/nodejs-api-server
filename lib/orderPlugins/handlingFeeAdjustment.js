var async = require('async');
var u = require('underscore');
var daos = require('../../daos');
var DAO = require('../../daos/DAO');
var utils = require('../../lib/utils');

exports.name = 'handlingFeeAdjustment';


function getPluginConfig(context) {
    var orderPluginsConfig = context.config.application.orderPlugins;
    if (!orderPluginsConfig) {
        return null;
    }

    return u.find(orderPluginsConfig, function (pluginConfig) {
        return pluginConfig.name === exports.name;
    });
}

function getHandlingFeeOrderAdjustment(context, callback) {
    var pluginConfig = getPluginConfig(context),
        adjustmentName = pluginConfig.adjustmentName || 'Handling Fee';

    context.readModels.SystemOrderAdjustment.find({
        where : {name : adjustmentName, active : true}
    }).done(callback);
}


exports.onCalculateAdjustments = function (context, operation, options, order, callback) {
    var logger = context.logger;

    if (order.isNoShipping) {
        callback();
        return;
    }

    async.waterfall([
        function (callback) {
            logger.debug("handlingFeeAdjustment: getting handling fee order adjustment settings...");
            getHandlingFeeOrderAdjustment(context, callback);
        },

        function (handlingFeeOrderAdjustment, callback) {
            console.log(handlingFeeOrderAdjustment);
            if (handlingFeeOrderAdjustment) {
                order.groupedAdjustments.handlingFee = {
                    order_id : order.id,
                    amount : handlingFeeOrderAdjustment.amount,
                    label : handlingFeeOrderAdjustment.name,
                    source_type : 'Order',
                    source_id : order.id,
                    mandatory : false,
                    originator_type : 'SystemOrderAdjustment',
                    originator_id : handlingFeeOrderAdjustment.id
                };
            }

            callback();
        }
    ], callback);
};


exports.onSaveAdjustments = function (context, operation, options, order, callback) {
    var logger = context.logger,
        adjustmentDao = daos.createDao('Adjustment', context),
        handlingFeeAdjustment = order.groupedAdjustments.handlingFee,
        adjustment;

    if (!handlingFeeAdjustment) {
        callback();
        return;
    }

    logger.debug("handlingFeeAdjustment: saving handling fee adjustments...");

    adjustment = {
        order_id : order.id,
        amount : handlingFeeAdjustment.amount,
        label : handlingFeeAdjustment.label,
        source_type : 'Order',
        source_id : order.id,
        mandatory : false,
        originator_type : handlingFeeAdjustment.originator_type,
        originator_id : handlingFeeAdjustment.originator_id
    };

    adjustmentDao.createAdjustment(adjustment, function (error, newAdjustment) {
        if (error) {
            callback(error);
            return;
        }

        order.adjustments.push(newAdjustment);
        callback();
    });
};

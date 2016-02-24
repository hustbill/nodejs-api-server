/**
 * PaymentMethod DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function PaymentMethod(context) {
    DAO.call(this, context);
}

util.inherits(PaymentMethod, DAO);


function getPaymentMethods(context, zoneIds, environment, activeFor, isForAdmin, callback) {
    var logger = context.logger,
        displayOn,
        conditionDisplayOn;

    if (isForAdmin) {
        displayOn = 'backend';
    } else {
        displayOn = 'frontend';
    }
    conditionDisplayOn = "display_on IS NULL OR display_on = 'all' OR display_on = '" + displayOn + "'";

    context.readModels.PaymentMethod.findAll({
        where: "environment = '" + environment + "' AND zone_id IN (" + zoneIds.concat(['NULL']).join(",") + ") AND active = TRUE AND (" + conditionDisplayOn + ") AND active_for = '" + activeFor + "'"
    }).success(function (paymentMethods) {
        logger.debug('%d payment methods found.', paymentMethods.length);
        callback(null, paymentMethods);
    }).error(callback);
}

function getAllPaymentMethods(context, zoneIds, environment, callback) {
    var logger = context.logger;

    context.readModels.PaymentMethod.findAll({
        where: "environment = '" + environment + "' AND zone_id IN (" + zoneIds.concat(['NULL']).join(",") + ") AND active = TRUE AND (display_on IS NULL OR display_on != 'none')"
    }).success(function (paymentMethods) {
        logger.debug('%d payment methods found.', paymentMethods.length);
        callback(null, paymentMethods);
    }).error(callback);
}

PaymentMethod.prototype.getAllPaymentMethodsInZones = function (zoneIds, environment, callback) {
    var context = this.context,
        logger = context.logger,
        error;

    if (environment !== 'development' && environment !== 'production') {
        error = new Error('Argument error: Unknown environment.');
        callback(error);
        return;
    }

    if (!zoneIds) {
        zoneIds = [];
    }

    logger.debug('Getting payment methods in zones %s', zoneIds);

    getAllPaymentMethods(context, zoneIds, environment, function (error, paymentMethods) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, paymentMethods);
    });
};


PaymentMethod.prototype.getPaymentMethodsInZones = function (zoneIds, environment, activeFor, isForAdmin, callback) {
    var context = this.context,
        logger = context.logger,
        error;

    if (environment !== 'development' && environment !== 'production') {
        error = new Error('Argument error: Unknown environment.');
        callback(error);
        return;
    }

    if (!zoneIds) {
        zoneIds = [];
    }

    if (!activeFor) {
        activeFor = 'all';
    }

    logger.debug('Getting payment methods in zones %s', zoneIds);

    async.waterfall([
        function (next) {
            getPaymentMethods(context, zoneIds, environment, activeFor, isForAdmin, function (error, paymentMethods) {
                if (error) {
                    callback(error);
                    return;
                }

                if (activeFor !== 'all' && !paymentMethods.length) {
                    next();
                    return;
                }

                callback(null, paymentMethods);
            });
        },

        function (callback) {
            getPaymentMethods(context, zoneIds, environment, 'all', isForAdmin, callback);
        }
    ], callback);
};

module.exports = PaymentMethod;

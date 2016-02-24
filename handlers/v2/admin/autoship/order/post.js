var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var mapper = require('../../../../../mapper');


function generateResponse(order) {
    return {
        statusCode : 201,
        body : {
            'order-id' : order.id,
            'order-number' : order.number,
            'order-date' : order.order_date,
            'state' : order.state
        }
    };
}


function getCreateAutoshipOrderOptions(context, autoshipId, callback) {
    var createOrderOptions = {
            isAutoship : true,
            autoshipId : autoshipId
        },
        autoshipDao = daos.createDao('Autoship', context),
        autoship,
        error;

    async.waterfall([
        function (callback) {
            autoshipDao.getById(autoshipId, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                autoship = result;

                if (!autoship) {
                    error = new Error("Autoship with id " + autoshipId + " does not exist.");
                    error.errorCode = 'InvalidAutoshipId';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                if (autoship.state !== 'complete') {
                    error = new Error("Autoship with id " + autoshipId + " is not complete.");
                    error.errorCode = 'NowAllowedToCreateAutoshipOrder';
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                createOrderOptions.userId = autoship.user_id;
                createOrderOptions.shippingAddressId = autoship.ship_address_id;
                createOrderOptions.billingAddressId = autoship.bill_address_id;
                createOrderOptions.shippingMethodId = autoship.shipping_method_id;
                callback();
            });
        },

        function (callback) {
            autoshipDao.getAutoshipItems(autoshipId, function (error, autoshipItems) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!autoshipItems.length) {
                    error = new Error("Autoship items were not found.");
                    error.errorCode = 'NowAllowedToCreateAutoshipOrder';
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                var lineItems = [],
                    roleDao = daos.createDao('Role', context);
                async.forEachSeries(autoshipItems, function (autoshipItem, callback) {
                    async.waterfall([
                        function (callback) {
                            roleDao.getRoleById(autoshipItem.role_id, callback);
                        },

                        function (role, callback) {
                            if (!role) {
                                error = new Error("Invalid autoship item. Role with id " + autoshipItem.role_id + " does not exist.");
                                error.errorCode = 'NowAllowedToCreateAutoshipOrder';
                                error.statusCode = 403;
                                callback(error);
                                return;
                            }

                            lineItems.push({
                                catalogCode : autoshipItem.catalog_code,
                                roleCode : role.role_code,
                                variantId : autoshipItem.variant_id,
                                quantity : autoshipItem.quantity
                            });

                            callback();
                        }
                    ], callback);
                }, function (error) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    createOrderOptions.lineItems = lineItems;
                    callback();
                });
            });
        },

        function (callback) {
            autoshipDao.getAutoshipAdjustmentsByAutoshipId(autoshipId, function (error, autoshipAdjustments) {
                if (error) {
                    callback(error);
                    return;
                }

                var additionalAdjustments = createOrderOptions.additionalAdjustments = [];
                autoshipAdjustments.forEach(function (adjustment) {
                    if (adjustment.active) {
                        additionalAdjustments.push({
                            label : adjustment.label,
                            amount : adjustment.amount
                        });
                    }
                });
            });
        },

        function (callback) {
            var autoshipPaymentDao = daos.createDao('AutoshipPayment', context);
            autoshipPaymentDao.getActivePaymentByAutoshipId(autoship.id, callback);
        },

        function (autoshipPayment, callback) {
            if (!autoshipPayment || !autoshipPayment.creditcard_id) {
                error = new Error("Can't find payment info of the autoship.");
                error.errorCode = 'NowAllowedToCreateAutoshipOrder';
                error.statusCode = 403;
                callback(error);
                return;
            }

            createOrderOptions.autoshipPaymentId = autoshipPayment.id;

            var creditcardDao = daos.createDao('Creditcard', context);
            creditcardDao.getCreditcardTokenByCreditcardId(autoshipPayment.creditcard_id, callback);
        },

        function (creditcardToken, callback) {
            if (!creditcardToken || !creditcardToken.payment_method_id) {
                error = new Error("Can't find creditcard token info of the autoship.");
                error.errorCode = 'NowAllowedToCreateAutoshipOrder';
                error.statusCode = 403;
                callback(error);
                return;
            }

            createOrderOptions.paymentMethodId = creditcardToken.payment_method_id;
            callback(null, createOrderOptions);
        }
    ], callback);
}

function post(request, response, next) {
    var context = request.context,
        autoshipId = parseInt(request.params.autoshipId, 10),
        error;

    if (!autoshipId) {
        error = new Error("Autoship id is required.");
        error.errorCode = 'InvalidAutoshipId';
        error.statusCode = 400;
        next(error);
        return;
    }

    async.waterfall([
        function (callback) {
            getCreateAutoshipOrderOptions(context, autoshipId, callback);
        },

        function (createAutoshipOrderOptions, callback) {
            var orderDao = daos.createDao('Order', context);
            orderDao.createOrder(createAutoshipOrderOptions, callback);
        }
    ], function (error, order) {
        if (error) {
            next(error);
            return;
        }
        next(generateResponse(order));
    });
}

module.exports = post;


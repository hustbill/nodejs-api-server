var async = require('async');
var u = require('underscore');
var moment = require('moment');
var daos = require('../../daos');
var DAO = require('../../daos/DAO');
var OrderDao = require('../../daos/Order');
var utils = require('../../lib/utils');

exports.name = 'discountAdjustment';


function getPluginConfig(context) {
    var orderPluginsConfig = context.config.application.orderPlugins;
    if (!orderPluginsConfig) {
        return null;
    }

    return u.find(orderPluginsConfig, function (pluginConfig) {
        return pluginConfig.name === exports.name;
    });
}


function calculateDiscountAdjustmentByClientRank(context, order, user, callback) {
    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getDistributorOfUser(user, callback);
        },

        function (distributor, callback) {
            var clientRankDao = daos.createDao('ClientRank', context);
            clientRankDao.getClientRankByRankIdentity(distributor.lifetime_rank, callback);
        },

        function (clientRank, callback) {
            if (!clientRank || !clientRank.discount_rate || clientRank.discount_rate <= 0) {
                callback(null, null);
                return;
            }

            var discountRate = clientRank.discount_rate,
                itemTotal = calculateOrderDiscountableItemTotal(order),
                discountAmount,
                adjustmentLabel,
                adjustment;

            if (!itemTotal) {
                callback(null, null);
                return;
            }

            discountAmount = utils.roundMoney(itemTotal * discountRate);
            adjustmentLabel = (discountRate * 100) + "% Discount";
            adjustment = {
                originator_type : 'ClientRank',
                originator_id : clientRank.id,
                label: adjustmentLabel,
                amount : discountAmount * -1
            };

            callback(null, adjustment);
        }
    ], callback);
}


function calcualteDiscountAdjustmentByPersonalQualificationVolume(context, order, user, callback) {
    var distributor;

    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getDistributorOfUser(user, callback);
        },

        function (result, callback) {
            distributor = result;

            var tableName = 'bonus.bonusm' + moment().format('YYYYMM') + '01_ranks',
                queryDatabaseOptions = {
                    sqlStmt : 'select * from ' + tableName + ' where distributor_id = $1',
                    sqlParams : [distributor.id]
                };

            DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
                if (error) {
                    callback(null, null);
                    return;
                }

                callback(null, result.rows[0]);
            });
        },

        function (bonusRank, callback) {
            var details,
                personalQualificationVolume = 0,
                orderQualificationVolume = OrderDao.calculateOrderQualificationVolume(order),
                discountRate;

            try {
                if (bonusRank && bonusRank.details) {
                    details = JSON.parse(bonusRank.details);
                    if (details) {
                        personalQualificationVolume = details['personal-qualification-volume'] || 0;
                    }
                }
            } catch (e) {
            }

            callback(null, personalQualificationVolume + orderQualificationVolume);
        },

        function (qualificationVolume, callback) {
            if (qualificationVolume < 200) {
                discountRate = 0.2;
            } else if (qualificationVolume >= 200 && qualificationVolume < 400) {
                discountRate = 0.3;
            } else {
                discountRate = 0.4;
            }

            callback(null, discountRate);
        },

        function (discountRate, callback) {
            var itemTotal = calculateOrderDiscountableItemTotal(order),
                discountAmount,
                adjustmentLabel,
                adjustment;

            if (!itemTotal) {
                callback(null, null);
                return;
            }

            discountAmount = utils.roundMoney(itemTotal * discountRate);
            adjustmentLabel = (discountRate * 100) + "% Discount";
            adjustment = {
                originator_type : 'BonusRank',
                originator_id : distributor.id,
                label: adjustmentLabel,
                amount : discountAmount * -1
            };

            callback(null, adjustment);
        }
    ], callback);
}


function calculateOrderDiscountableItemTotal(order) {
    var discountableItemTotal = 0;
    order.lineItems.forEach(function (lineItem) {
        if (lineItem.variant.can_discount) {
            discountableItemTotal = utils.roundMoney(discountableItemTotal + lineItem.price * (lineItem.quantity - (lineItem.discountQuantity || 0)));
        }
    });
    return discountableItemTotal;
}


function calculateDiscountAdjustmentOfOrder(context, order, callback) {
    if (order.autoship) {
        callback(null, null);
        return;
    }

    if (order.lineItems && order.lineItems[0] && order.lineItems[0].role_code && order.lineItems[0].role_code === 'R') {
        callback(null, null);
        return;
    }

    var user;

    async.waterfall([
        function (next) {
            var rolesCanHaveOrderDiscount = context.config.application.rolesCanHaveOrderDiscount,
                orderDao;

            if (!rolesCanHaveOrderDiscount || rolesCanHaveOrderDiscount.length == 0) {
                callback(null, null);
                return;
            }

            orderDao = daos.createDao('Order', context);
            orderDao.getUserOfOrder(order, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }
                user = result;

                var userDao = daos.createDao('User', context);
                userDao.isUserInAnyRolesByCode(user, rolesCanHaveOrderDiscount, function (error, isInAnyRoles) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!isInAnyRoles) {
                        callback(null, null);
                    }

                    next();
                });
            });
        },

        function (callback) {
            // get discount rate
            var companyCode = context.companyCode;
            if (companyCode === 'BEB') {
                calculateDiscountAdjustmentByClientRank(context, order, user, callback);
            } else if (companyCode === 'WNP') {
                calcualteDiscountAdjustmentByPersonalQualificationVolume(context, order, user, callback);
            } else {
                callback(null, null);
            }
        }
    ], callback);
}
 


exports.onCalculateAdjustments = function (context, operation, options, order, callback) {
    var logger = context.logger;

    async.waterfall([
        function (callback) {
            logger.debug('discountAdjustment: calculating discount adjustment...');
            calculateDiscountAdjustmentOfOrder(context, order, callback);
        },

        function (adjustment, callback) {
            if (adjustment) {
                if (!order.groupedAdjustments) {
                    order.groupedAdjustments = {};
                }

                order.groupedAdjustments.discount = {
                    order_id : order.id,
                    amount : adjustment.amount,
                    label : adjustment.label,
                    source_type : 'Order',
                    source_id : order.id,
                    mandatory : false,
                    originator_type : adjustment.originator_type,
                    originator_id : adjustment.originator_id
                };
            }

            callback();
        }
    ], callback);
};


exports.onSaveAdjustments = function (context, operation, options, order, callback) {
    var logger = context.logger,
        adjustmentDao = daos.createDao('Adjustment', context),
        discountAdjustment = order.groupedAdjustments.discount,
        adjustment;

    if (!discountAdjustment) {
        callback();
        return;
    }

    logger.debug("discountAdjustment: saving discount adjustments...");

    adjustment = {
        order_id : order.id,
        amount : discountAdjustment.amount,
        label : discountAdjustment.label,
        source_type : 'Order',
        source_id : order.id,
        mandatory : false,
        originator_type : discountAdjustment.originator_type,
        originator_id : discountAdjustment.originator_id
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

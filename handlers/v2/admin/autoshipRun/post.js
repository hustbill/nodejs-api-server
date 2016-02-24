// POST /v2/admin/autoship-runs

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');
var DAO = require('../../../../daos/DAO');
var AutoshipDao = require('../../../../daos/Autoship');
var mapper = require('../../../../mapper');
var moment = require('moment');


function getPostData(request) {
    var body = request.body,
        data = {
            autoshipDate : moment(body['autoship-date']),
            autoshipId : parseInt(body['autoship-id'], 10)
        };

    return data;
}

function generateResponse(autoshipRuns) {
    var result = {
            statusCode : 200,
            body : autoshipRuns.map(function (autoshipRun) {
                return {
                    "autoship-id" : autoshipRun.autoship_id,
                    "order-id" : autoshipRun.order_id,
                    "request" : autoshipRun.request,
                    "details" : autoshipRun.details,
                    "state" : autoshipRun.state
                };
            })
        };

    return result;
}


function getCompletedAutoshipById(context, autoshipId, callback) {
    var logger = context.logger,
        queryDatabaseOptions;

    logger.info("Getting completed autoship with id %d...", autoshipId);
    queryDatabaseOptions = {
        sqlStmt : "select * from autoships where id= $1 and state = 'complete'",
        sqlParams : [autoshipId]
    };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
        if (error) {
            logger.error("Failed to get autoship: %s", error.message);
            callback(error);
            return;
        }

        var autoships = result.rows;
        logger.debug("%d completed autoships found.", autoships.length);
        if (autoships.length) {
            callback(null, autoships[0]);
        } else {
            callback(null, null);
        }
    });
}

function getCompletedAutoshipsByAutoshipDate(context, autoshipDate, callback) {
    var logger = context.logger,
        today = moment().format('YYYY-MM-DD'),
        queryDatabaseOptions,
        activeDateOfMonth,
        error;

    if (!autoshipDate.isValid()) {
        error = new Error("Invalid autoship date.");
        error.errorCode = 'InvalidAutoshipDate';
        error.statusCode = 400;
        callback(error);
        return;
    }

    activeDateOfMonth = autoshipDate.date();
    if (activeDateOfMonth < 1 || activeDateOfMonth > 28) {
        error = new Error("Invalid autoship date. Date of month must be 1-28.");
        error.errorCode = 'InvalidAutoshipDate';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (autoshipDate.isAfter(today)) {
        error = new Error("Invalid autoship date. Autoship date can not later than today.");
        error.errorCode = 'InvalidAutoshipDate';
        error.statusCode = 400;
        callback(error);
        return;
    }

    logger.info("Getting completed autoships of that should be shipped at %s...", autoshipDate);
    queryDatabaseOptions = {
        sqlStmt : "select * from autoships where autoships.state = 'complete' and next_autoship_date = $1",
        sqlParams : [autoshipDate.toDate()]
    };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
        if (error) {
            logger.error("Failed to get autoship: %s", error.message);
            callback(error);
            return;
        }

        var autoships = result.rows;
        logger.debug("%d completed autoships found.", autoships.length);
        callback(null, autoships);
    });
}

function getAutoshipOrderCreatedAtAutoshipDate(context, autoshipId, autoshipDate, callback) {
    var beginDate = autoshipDate.format('YYYY-MM-DD'),
        endDate = moment(autoshipDate).add('days', 1).format('YYYY-MM-DD'),
        queryDatabaseOptions = {
            sqlStmt : "select * from orders where autoship=true and autoship_id=$1 and order_date >= '" + beginDate + "' and order_date < '" + endDate + "'",
            sqlParams : [autoshipId]
        };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        if (!result.rows.length) {
            callback(null, null);
            return;
        }

        callback(null, result.rows[0]);
    });
}

function validateAutoship(context, autoship, autoshipDate, callback) {
    var autoshipPayment;

    async.waterfall([
        function (next) {
            // check next_autoship_date
            if (autoship.next_autoship_date && (autoship.next_autoship_date.getTime() !== autoshipDate.toDate().getTime())) {
                callback(null, {reason : "Autoship should be run on this day. next_autoship_date=" + autoship.next_autoship_date});
                return;
            }

            next();
        },

        function (next) {
            // check autoship payment
            var autoshipPaymentDao = daos.createDao('AutoshipPayment', context);
            autoshipPaymentDao.getActivePaymentByAutoshipId(autoship.id, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                autoshipPayment = result;

                if (!autoshipPayment) {
                    callback(null, {reason : "Can't find payment info of the autoship."});
                    return;
                }

                next();
            });
        },

        function (next) {
            if (!autoshipPayment.creditcard_id && context.config.application.enableCashAutoship) {
                next();
                return;
            }

            // check creditcard token
            var creditcardDao = daos.createDao('Creditcard', context);
            creditcardDao.getCreditcardTokenByCreditcardId(autoshipPayment.creditcard_id, function (error, creditcardToken) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!creditcardToken) {
                    callback(null, {reason : "Can't find creditcard token info of the autoship."});
                    return;
                }

                next();
            });
        },

        function (next) {
            // check autoship order 
            getAutoshipOrderCreatedAtAutoshipDate(context, autoship.id, autoshipDate, function (error, order) {
                if (error) {
                    callback(error);
                    return;
                }

                if (order) {
                    callback(null, {reason : "Autoship order already been created. order.id=" + order.id, orderId : order.id});
                    return;
                }

                next();
            });
        },

        function (callback) {
            callback(null, null);
        }
    ], callback);
}


function getCashPaymentMethodOfAutoship(context, autoship, callback) {
    async.waterfall([
        function (callback) {
            var addressDao = daos.createDao('Address', context);
            addressDao.getById(autoship.ship_address_id, callback);
        },

        function (address, callback) {
            var orderDao = daos.createDao('Order', context);
            orderDao.getAvailableAutoshipPaymentMethodsByCountryId(address.country_id, callback);
        },

        function (paymentMethods, callback) {
            var cashPaymentMethod = u.find(paymentMethods, function (item) {return item.type === 'PaymentMethod::Cash'});
            callback(null, cashPaymentMethod);
        }
    ], callback);
}


function getCreateAutoshipOrderOptions(context, autoship, autoshipDate, callback) {
    var autoshipId = autoship.id,
        createOrderOptions = {
            isAutoship : true,
            autoshipId : autoshipId
        },
        autoshipDao = daos.createDao('Autoship', context),
        error;

    async.waterfall([
        function (callback) {
            createOrderOptions.userId = autoship.user_id;
            createOrderOptions.shippingAddressId = autoship.ship_address_id;
            createOrderOptions.billingAddressId = autoship.bill_address_id;
            createOrderOptions.shippingMethodId = autoship.shipping_method_id;

            if (autoshipDate) {
                createOrderOptions.orderDate = autoshipDate.startOf('day').toDate();
            }
            callback();
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
				callback();
            });
        },

        function (callback) {
            var autoshipPaymentDao = daos.createDao('AutoshipPayment', context);
            autoshipPaymentDao.getActivePaymentByAutoshipId(autoship.id, callback);
        },

        function (autoshipPayment, callback) {
            if (!autoshipPayment ||
                    (!autoshipPayment.creditcard_id && !context.config.application.enableCashAutoship)) {
                error = new Error("Can't find payment info of the autoship.");
                error.errorCode = 'NowAllowedToCreateAutoshipOrder';
                error.statusCode = 403;
                callback(error);
                return;
            }

            createOrderOptions.autoshipPaymentId = autoshipPayment.id;

            if (autoshipPayment.creditcard_id) {
                var creditcardDao = daos.createDao('Creditcard', context);
                creditcardDao.getCreditcardTokenByCreditcardId(autoshipPayment.creditcard_id, function (error, creditcardToken) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!creditcardToken || !creditcardToken.payment_method_id) {
                        error = new Error("Can't find creditcard token info of the autoship.");
                        error.errorCode = 'NowAllowedToCreateAutoshipOrder';
                        error.statusCode = 403;
                        callback(error);
                        return;
                    }

                    createOrderOptions.paymentMethodId = creditcardToken.payment_method_id;
                    callback();
                });
            } else {
                getCashPaymentMethodOfAutoship(context, autoship, function (error, cashPaymentMethod) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!cashPaymentMethod) {
                        error = new Error("Can't find cash payment method.");
                        error.errorCode = 'NowAllowedToCreateAutoshipOrder';
                        error.statusCode = 403;
                        callback(error);
                        return;
                    }

                    createOrderOptions.paymentMethodId = cashPaymentMethod.id;
                    callback();
                });
            }
        },

        function (callback) {
            callback(null, createOrderOptions);
        }
    ], callback);
}

function updateLastAutoshipDateAndNextAutoshipDate(context, autoship, callback) {
    var now = new Date(),
        lastAutoshipDate,
        nextAutoshipDate,
        queryDatabaseOptions;

    lastAutoshipDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    nextAutoshipDate = AutoshipDao.getNextAutoshipDate(now,
        autoship.active_date,
        autoship.frequency_by_month,
        autoship.start_date,
        lastAutoshipDate);

    queryDatabaseOptions = {
        sqlStmt: "update autoships set last_autoship_date = $1, next_autoship_date = $2 where id = $3",
        sqlParams: [lastAutoshipDate, nextAutoshipDate, autoship.id]
    };
    DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
        callback(error);
    });
}

function createAutoshipOrder(context, autoship, autoshipDate, callback) {
    var logger = context.logger,
        order;

    logger.debug("Creating order for autoship %d.", autoship.id);
    async.waterfall([
        function (callback) {
            getCreateAutoshipOrderOptions(context, autoship, autoshipDate, callback);
        },

        function (createAutoshipOrderOptions, callback) {
            var orderDao = daos.createDao('Order', context);
            orderDao.createOrder(createAutoshipOrderOptions, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                order = result;
                callback();
            });
        },

        function (callback) {
            updateLastAutoshipDateAndNextAutoshipDate(context, autoship, function (error) {
                callback(null, order);
            });
        }
    ], callback);
}

function processAutoship(context, autoship, autoshipDate, callback) {
    var logger = context.logger,
        autoshipRun = {
            autoship_id : autoship.id
        },
        shouldCreateOrder = false;

    async.waterfall([
        function (callback) {
            validateAutoship(context, autoship, autoshipDate, function (error, failure) {
                if (error) {
                    callback(error);
                    return;
                }

                if (failure) {
                    autoshipRun.state = 'failed';
                    autoshipRun.details = failure.reason;
                    if (failure.reason && failure.reason.orderId) {
                        autoshipRun.order_id = failure.reason.orderId;
                    }
                } else {
                    shouldCreateOrder = true;
                }

                callback();
            });
        },

        function (callback) {
            if (!shouldCreateOrder) {
                autoshipRun.state = 'skipped';
                callback();
                return;
            }

            createAutoshipOrder(context, autoship, autoshipDate, function (error, order) {
                if (error) {
                    logger.error("Failed to create autoship order: %s", error.message);
                    autoshipRun.state = 'failed';
                    autoshipRun.details = error.message;
                }

                if (order) {
                    if (order.payment_state === 'failed') {
                        autoshipRun.state = 'failed';
                        autoshipRun.details = "Order created but payment failed. order.id=" + order.id + ". error message: " + (order.error && order.error.message);
                    } else {
                        autoshipRun.state = 'completed';
                        autoshipRun.details = "Order created. order.id=" + order.id;
                    }
                    autoshipRun.order_id = order.id;
                }

                callback();
            });
        },

        function (callback) {
            context.models.AutoshipRun.create(autoshipRun).done(function () {
                callback(null, autoshipRun);
            });
        }
    ], callback);
}

/*
 *  options = {
 *      autoshipDate : <Integer>,
 *      autoshipId : <Integer>,
 *  }
 */
function generateAutoshipOrders(context, options, callback) {
    var logger = context.logger,
        results = [];

    logger.info("Start generating autoship orders...");
    async.waterfall([
        function (callback) {
            if (options.autoshipId) {
                getCompletedAutoshipById(context, options.autoshipId, function (error, autoship) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (autoship) {
                        callback(null, [autoship]);
                        return;
                    }

                    callback(null, []);
                });
            } else if (options.autoshipDate){
                getCompletedAutoshipsByAutoshipDate(context, options.autoshipDate, callback);
            } else {
                var error = new Error("'autoship-id' or 'autoship-date' is required.");
                error.statusCode = 400;
                callback(error);
            }
        },

        function (autoships, callback) {
            async.forEachSeries(autoships, function (autoship, callback) {

                processAutoship(context, autoship, options.autoshipDate, function (error, result) {
                    results.push(result);
                    callback();
                });

            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, results);
            });
        }
    ], callback);
}

/**
 * Create autoship order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        logger = context.logger,
        generateAutoshipOrdersOptions = getPostData(request);

    logger.debug("Start running autoships, request body: %j", request.body);
    async.waterfall([
        function (callback) {
            generateAutoshipOrdersOptions.autoshipDate = moment(generateAutoshipOrdersOptions.autoshipDate.format('YYYY-MM-DD'));
            if (generateAutoshipOrdersOptions.autoshipDate.isAfter(moment(moment().format('YYYY-MM-DD')))) {
                var error = new Error("autoship-date can't be a future date.");
                error.statusCode = 400;
                error.errorCode = 'InvalidAutoshipDate';
                callback(error);
                return;
            }
            callback();
        },

        function (callback) {
            generateAutoshipOrders(context, generateAutoshipOrdersOptions, callback);
        }
    ], function (error, autoshipRuns) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(autoshipRuns));
    });
}

module.exports = post;

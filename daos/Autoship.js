/**
 * Autoship DAO class.
 */

var util = require('util');
var async = require('async');
var request = require('request');
var u = require('underscore');
var DAO = require('./DAO.js');
var daos = require('./index');
var statsdHelper = require('../lib/statsdHelper');
var airbrakeHelper = require('../lib/airbrakeHelper');

function Autoship(context) {
    DAO.call(this, context);
}

util.inherits(Autoship, DAO);

Autoship.prototype.list = function (distributorId, callback) {
    var options;

    options = {
        cache : {
            key : 'Autoship_' + distributorId,
            ttl : 3600  // 1 hours = 60 * 60 * 1
        },
        sqlStmt: 'SELECT * FROM mobile.get_autoships($1)',
        sqlParams: [distributorId]
    };

    this.queryDatabase(options, callback);
};

Autoship.prototype.listOrderDetails = function (distributorId, callback) {
    var options;

    options = {
        cache : {
            key : 'AutoshipOrdersDetails_' + distributorId,
            ttl : 3600  // 1 hours = 60 * 60 * 1
        },
        sqlStmt: 'SELECT * FROM mobile.get_recent_autoship_header_info($1)',
        sqlParams: [distributorId]
    };

    this.queryDatabase(options, callback);
};

function getNextAutoshipDate(now, activeDate, frequencyByMonth, startDate, lastAutoshipDate) {
    var nextAutoshipMonth,
        nextAutoshipDate;

    if (typeof startDate === 'string') {
        startDate = new Date(Date.parse(startDate));
    } else if (!startDate) {
        startDate = now;
    }

    if (!lastAutoshipDate ||    // for first time we setup the autoship
            startDate > now) {  // or we have changed the start date to a later time
        if (now.getDate() <= activeDate) {
            nextAutoshipMonth = now.getMonth();
        } else {
            nextAutoshipMonth = now.getMonth() + 1;
        }

        nextAutoshipDate = new Date(now.getFullYear(), nextAutoshipMonth, activeDate);

        // make sure that next autoship date is always later then start date
        if (startDate > nextAutoshipDate) {
            if (activeDate >= startDate.getDate()) {
                nextAutoshipMonth = startDate.getMonth();
            } else {
                nextAutoshipMonth = startDate.getMonth() + 1;
            }
            nextAutoshipDate = new Date(startDate.getFullYear(), nextAutoshipMonth, activeDate);
        }
    } else {
        nextAutoshipMonth = lastAutoshipDate.getMonth() + frequencyByMonth;
        nextAutoshipDate = new Date(lastAutoshipDate.getFullYear(), nextAutoshipMonth, activeDate);
    }

    return nextAutoshipDate;
}

function getUserOfAutoship(context, autoship, callback) {
    if (autoship.user) {
        callback(null, autoship.user);
        return;
    }

    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getById(autoship.user_id, callback);
        },

        function (user, callback) {
            autoship.user = user;
            callback(null, user);
        }
    ], callback);
}

function getBillingAddressOfAutoship(context, autoship, callback) {
    if (autoship.billingAddress) {
        callback(null, autoship.billingAddress);
        return;
    }

    async.waterfall([
        function (callback) {
            var addressDao = daos.createDao('Address', context);
            addressDao.getAddressById(autoship.bill_address_id, callback);
        },

        function (address, callback) {
            autoship.billingAddress = address;
            callback(null, address);
        }
    ], callback);
}

function getShippingAddressOfAutoship(context, autoship, callback) {
    if (autoship.shippingAddress) {
        callback(null, autoship.shippingAddress);
        return;
    }

    async.waterfall([
        function (callback) {
            var addressDao = daos.createDao('Address', context);
            addressDao.getAddressById(autoship.ship_address_id, callback);
        },

        function (address, callback) {
            autoship.shippingAddress = address;
            callback(null, address);
        }
    ], callback);
}


function validateAutoshipItems(context, autoshipItems, callback) {
    var error;

    if (!autoshipItems || !autoshipItems.length) {
        error = new Error("Auto-ship items are required.");
        error.errorCode = 'InvalidAutoshipItems';
        error.statusCode = '400';
        callback(error);
        return;
    }

    callback();
}

function clearAutoshipItemsOfAutoship(context, autoship, callback) {
    var queryDatabaseOptions = {
            useWriteDatabase : true,
            sqlStmt : "DELETE FROM autoship_items WHERE autoship_id = $1",
            sqlParams : [autoship.id]
        };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
        callback(error);
    });
}

function saveAutoshipItems(context, autoship, autoshipItems, callback) {
    var autoshipItemModel = context.models.AutoshipItem,
        userDao = daos.createDao('User', context),
        user = autoship.user,
        newAutoshipItems = [];

    async.forEachSeries(autoshipItems, function (autoshipItem, callback) {
        async.waterfall([
            function (callback) {
                if (!autoshipItem.roleCode) {
                    userDao.getRolesOfUser(user, function (error, roles) {
                        if (!roles.length) {
                            error = new Error("User doesn't belong to any roles.");
                            error.errorCode = 'NoPermissionToGetVariantDetail';
                            error.statusCode = 403;
                            callback(error);
                            return;
                        }

                        autoshipItem.roleId = roles[0].id;
                        callback();
                    });

                    return;
                }

                var roleDao = daos.createDao('Role', context);
                roleDao.getRoleByCode(autoshipItem.roleCode, function (error, role) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!role) {
                        error = new Error("Role with code '" + autoshipItem.roleCode + "' does not exist.");
                        error.errorCode = 'InvalidRoleCode';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    autoshipItem.roleId = role.id;
                    callback();
                });
            },

            function (callback) {
                autoshipItem.autoship_id = autoship.id;
                var entity = {
                    autoship_id : autoship.id,
                    catalog_code : autoshipItem.catalogCode,
                    role_id : autoshipItem.roleId,
                    variant_id : autoshipItem.variantId,
                    quantity : autoshipItem.quantity
                };
                autoshipItemModel.create(entity).success(function (newAutoshipItem) {
                    newAutoshipItems.push(newAutoshipItem);

                    callback();
                }).error(callback);
            }
        ], callback);
    }, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, newAutoshipItems);
    });
}

function saveAutoshipAdjustments(context, autoship, autoshipAdjustments, callback) {
    if (!autoshipAdjustments || !autoshipAdjustments.length) {
        callback(null, null);
        return;
    }

    var newAutoshipAdjustments = [],
        autoshipAdjustmentModel = context.models.AutoshipAdjustment;
    async.forEachSeries(autoshipAdjustments, function (autoshipAdjustment, callback) {
        var entity = {
            active : true,
            autoship_id : autoship.id,
            amount : autoshipAdjustment.amount,
            label : autoshipAdjustment.label
        };
        autoshipAdjustmentModel.create(entity).success(function (newAutoshipAdjustment) {
            newAutoshipAdjustments.push(newAutoshipAdjustment);
            callback();
        }).error(callback);
    }, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, newAutoshipAdjustments);
    });
}

function canUseTokenPaymentInCountry(country, callback) {
    var countriesSupportPaymentToken = ["GB", "GR", "BE", "NL", "FR", "CA", "CZ", "CY", "SI", "IE", "PL", "PE", "AT", "DE", "ES", "MY", "M1", "EC", "NZ", "AU", "PH", "TH", "MX", "JP", "US", "DO", "JM", "RU", "HU", "TW", 'UA', 'IT', 'SG'];

    callback(null, countriesSupportPaymentToken.indexOf(country.iso) !== -1);
}

function canUseTokenPayment(context, autoship, callback) {
    async.waterfall([
        function (callback) {
            getUserOfAutoship(context, autoship, callback);
        },

        function (user, callback) {
            var userDao = daos.createDao('User', context);
            userDao.getCountryOfUser(user, callback);
        },

        function (country, callback) {
            canUseTokenPaymentInCountry(country, callback);
        }
    ], callback);
}

function createCreditcardPayment(context, autoship, creditcard, callback) {
    var logger = context.logger;

    async.waterfall([
        function (callback) {
            var autoshipPayment = {
                autoship_id : autoship.id,
                user_id : autoship.user_id,
                creditcard_id : creditcard.id,
                created_by : autoship.user_id,
                active : true
            };

            context.models.AutoshipPayment.create(autoshipPayment).done(callback);
        },

        function (newAutoshipPayment, callback) {
            // disable creditcard of other payments
            var sqlStmt = "update creditcards set active = false where id in (select creditcard_id from autoship_payments where autoship_id = $1 and creditcard_id != $2)",
                sqlParams = [autoship.id, creditcard.id];

            logger.trace(
                'Executing sql query: %s with sqlParams %j',
                sqlStmt,
                sqlParams
            );

            context.databaseClient.query(sqlStmt, sqlParams, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, newAutoshipPayment);
            });
        }
    ], callback);
}

function addCreditcardInfoPayment(context, autoship, paymentInfo, callback) {
    async.waterfall([
        function (callback) {
            // save creditcard
            var creditcardDao = daos.createDao('Creditcard', context),
                creditcard = paymentInfo.creditcard,
                createCreditcardOptions = {
                    saveIssueNumber : true,
                    number : creditcard.number,
                    year : creditcard.year,
                    month : creditcard.month,
                    cvv : creditcard.cvv,
                    active : true
                };

            creditcardDao.createCreditcard(createCreditcardOptions, callback);
        },

        function (newCreditcard, callback) {
            createCreditcardPayment(context, autoship, newCreditcard, callback);
        }
    ], callback);
}

function sendCreatePaymentTokenRequest(context, requestData, callback) {
    var logger = context.logger,
        paymentConfig = context.config.payment,
        serverAddress = paymentConfig.address,
        clientId = paymentConfig.clientId,
        timeout = paymentConfig.timeout,
        url = serverAddress + '/tokens',
        requestOptions,
        stat;

    requestOptions = {
        method : 'POST',
        headers : {
            Accept : 'application/json',
            'Accept-Language' : 'en-US',
            'Content-Type' : 'application/json',
            'User-Agent' : 'mobile-pulse/2.0.0',
            'X-Client-Id' : clientId
        },
        url : url,
        timeout : timeout,
        json : requestData
    };

    logger.debug('Sending create payment token request to payment server: %s', serverAddress);
    logger.debug(requestData);
    //logger.debug(u.omit(requestData, 'creditcard'));

    stat = statsdHelper.beginStat(context, 'create_payment_token_request');

    request(requestOptions, function (error, response, body) {
        var paymentError,
            errorMessage;

        if (error) {
            stat.finishStat('failed');

            airbrakeHelper.notifyError(context, error, {
                component : 'create_payment_token_request',
                params : {
                    requestData : u.omit(requestData, 'creditcard')
                }
            });

            callback(error);
            return;
        }

        logger.debug('response status code: %d', response.statusCode);
        logger.debug('response body: %j', body);

        if (response.statusCode !== 200) {
            error = body && body.meta && body.meta.error;

            stat.finishStat('failed');

            errorMessage = 'Create payment token request failed.';
            if (error && error.message) {
                errorMessage += ' ' + error.message;
            }

            paymentError = new Error(errorMessage);
            paymentError.errorCode = 'CreatePaymentTokenFailed';

            airbrakeHelper.notifyError(context, paymentError, {
                component : 'payment_request',
                params : {
                    requestData : u.omit(requestData, 'creditcard')
                }
            });

            logger.error(paymentError.message);
            callback(paymentError);
            return;
        }

        stat.finishStat('succeeded');
        callback(null, body.response);
    });
}

function processCreatePaymentTokenRequest(context, requestData, callback) {
    var logger = context.logger,
        tryCount = 0,
        tryLimit = 3,
        paymentResult,
        lastError;

    async.whilst(function () {
        return tryCount < tryLimit;
    }, function (next) {
        tryCount += 1;
        logger.debug('Trying send create payment token request... ' + tryCount);
        sendCreatePaymentTokenRequest(context, requestData, function (error, result) {
            if (error) {
                lastError = error;
                if (error.code === 'ETIMEDOUT' ||
                        error.code === 'ESOCKETTIMEDOUT') {
                    // network issues, try again.
                    next();
                    return;
                }

                next(error);
                return;
            }

            callback(null, result);
        });
    }, function (error) {
        error = error || lastError;

        var paymentError = new Error(error.message || error);
        paymentError.errorCode = error.errorCode || 'CreatePaymentTokenFailed';
        callback(paymentError);
    });
}

function createPaymentToken(context, autoship, creditcard, paymentMethodId, callback) {
    var logger = context.logger,
        createPaymentTokenData = {
            'user-id' : autoship.user_id,
            'payment-method-id' : paymentMethodId,
            'creditcard' : {
                number : creditcard.number,
                'expiry-year' : creditcard.year,
                'expiry-month' : creditcard.month,
                cvv : creditcard.cvv
            },
            'billing-address' : null
        };

    logger.debug('Creating payment token...');
    async.waterfall([
        function (callback) {
            getBillingAddressOfAutoship(context, autoship, callback);
        },

        function (address, callback) {
            createPaymentTokenData['billing-address'] = {
                'first-name' : address.firstname,
                'last-name' : address.lastname,
                street : address.address1,
                'street-cont' : address.address2 || '',
                city: address.city,
                zip : address.zipcode,
                state : address.state && address.state.name,
                'state-abbr' : address.state && address.state.abbr,
                'country-iso' : address.country.iso,
                phone : address.phone || ''
            };

            processCreatePaymentTokenRequest(context, createPaymentTokenData, function (error, result) {
                if (error) {
                    logger.error('Create payment token failed: %s', error.message);
                    callback(error);
                    return;
                }

                callback(null, result['payment-token-id']);
            });
        }
    ], callback);
}

function addCreditcardTokenPayment(context, autoship, paymentInfo, callback) {
    var creditcardDao = daos.createDao('Creditcard', context),
        newCreditcard;

    async.waterfall([
        function (callback) {
            // save creditcard
            var creditcard = paymentInfo.creditcard,
                createCreditcardOptions = {
                    saveIssueNumber : true,
                    number : creditcard.number,
                    year : creditcard.year,
                    month : creditcard.month,
                    cvv : creditcard.cvv,
                    active : true,
                    user_id : autoship.user_id
                };

            creditcardDao.createCreditcard(createCreditcardOptions, callback);
        },

        function (result, callback) {
            newCreditcard = result;

            // create payment token
            createPaymentToken(context, autoship, newCreditcard, paymentInfo.paymentMethodId, function (error, paymentTokenId) {
                if (error) {
                    callback(error);
                    return;
                }

                creditcardDao.setTokenIdOfCreditcard(newCreditcard, paymentInfo.paymentMethodId, paymentTokenId, callback);
            });
        },

        function (callback) {
            createCreditcardPayment(context, autoship, newCreditcard, callback);
        }
    ], callback);
}

function addCreditcardPayment(context, autoship, paymentInfo, callback) {
    async.waterfall([
        function (callback) {
            canUseTokenPayment(context, autoship, callback);
        },

        function (usePaymentToken, callback) {
            if (usePaymentToken) {
                addCreditcardTokenPayment(context, autoship, paymentInfo, callback);
            } else {
                addCreditcardInfoPayment(context, autoship, paymentInfo, callback);
            }
        }
    ], callback);
}

function addCashPayment(context, autoship, paymentInfo, callback) {
    async.waterfall([
        function (callback) {
            var autoshipPayment = {
                autoship_id : autoship.id,
                user_id : autoship.user_id,
                creditcard_id : null,
                created_by : autoship.user_id,
                active : true
            };

            context.models.AutoshipPayment.create(autoshipPayment).done(callback);
        },

        function (newAutoshipPayment, callback) {
            // disable creditcard of other payments
            var sqlStmt = "update creditcards set active = false where id in (select creditcard_id from autoship_payments where autoship_id = $1)",
                sqlParams = [autoship.id],
                queryDatabaseOptions = {
                    useWriteDatabase : true,
                    sqlStmt : sqlStmt,
                    sqlParams : sqlParams
                };

            DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, newAutoshipPayment);
            });
        }
    ], callback);
}

function setPaymentOfAutoship(context, autoship, paymentInfo, callback) {
    var logger = context.logger;

    async.waterfall([
        function (callback) {
            var queryDatabaseOptions = {
                sqlStmt : "update autoship_payments set active=false where autoship_id = $1",
                sqlParams : [autoship.id]
            };

            DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                callback(error);
            });
        },

        function (callback) {
            var paymentMethodDao = daos.createDao('PaymentMethod', context);
            paymentMethodDao.getById(paymentInfo.paymentMethodId, function (error, paymentMethod) {
                if (error) {
                    callback(error);
                    return;
                }

                if (paymentMethod.is_creditcard) {
                    addCreditcardPayment(context, autoship, paymentInfo, callback);
                    return;
                }
                
                if (paymentMethod.type === 'PaymentMethod::Cash') {
                    if (context.config.application.enableCashAutoship) {
                        addCashPayment(context, autoship, paymentInfo, callback);
                        return;
                    }
                }

                error = new Error('Unsupported payment method for auto-ship.');
                error.errorCode = 'InvalidPaymentMethodId';
                callback(error);
            });
        },

        function (autoshipPayment, callback) {
            autoship.state = 'complete';
            autoship.save(['state']).done(function (error) {
                callback(error);
            });
        }
    ], function (error) {
        if (error) {
            logger.error("Failed to set payment of autoship: " + error.message);

            autoship.state = 'cancelled';
            autoship.save(['state']).done(function () {
                callback(error);
            });
            return;
        }

        callback();
    });
}


function getActiveAutoshipPayment(context, autoship, callback) {
    if (autoship.activeAutoshipPayment) {
        callback(null, autoship.activeAutoshipPayment);
        return;
    }

    context.readModels.AutoshipPayment.find({
        where : {
            autoship_id : autoship.id,
            active : true
        }
    }).done(function (error, payment) {
        autoship.activeAutoshipPayment = payment;
        callback(null, payment);
    });
}


Autoship.prototype.createAutoship = function (options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        addressDao = daos.createDao('Address', context),
        userId = options.userId,
        autoship,
        error;

    // check parameters
    if (!options.userId) {
        error = new Error('User id is required.');
        error.errorCode = 'InvalidUserId';
        callback(error);
        return;
    }

    if (!options.billingAddress) {
        error = new Error('Billing address is required.');
        error.errorCode = 'InvalidBillingAddress';
        callback(error);
        return;
    }

    if (!options.shippingAddress) {
        error = new Error('Shipping address is required.');
        error.errorCode = 'InvalidShippingAddress';
        callback(error);
        return;
    }

    if (!options.shippingMethodId) {
        error = new Error('Shipping method id is required.');
        error.errorCode = 'InvalidShippingMethodId';
        callback(error);
        return;
    }

    autoship = {
        user_id : userId,
        state : 'cart',
        bill_address_id : 0,
        ship_address_id : 0,
        shipping_method_id : options.shippingMethodId,
        shipment_state : null,
        payment_state : null,
        email : null,
        special_instructions : null,
        active_date : options.activeDate || 7,
        start_date : options.startDate,
        frequency_by_month : options.frequencyByMonth || 1,
        last_autoship_date : null,
        next_autoship_date : null,
        created_by : context.user.userId
    };

    async.waterfall([
        function (callback) {
            validateAutoshipItems(context, options.autoshipItems, callback);
        },

        function (callback) {
            var orderDao = daos.createDao('Order', context),
                validateOrderOptions = {
                    lineItems : options.autoshipItems,
                    shippingMethodId : options.shippingMethodId,
                    shippingAddress : options.shippingAddress,
                    paymentMethodId : options.paymentMethodId,
                    billingAddress : options.billingAddress
                };
            orderDao.validateOrder(validateOrderOptions, callback);
        },

        function (callback) {
            // save shipping address
            addressDao.createShippingAddress(options.shippingAddress, function (error, address) {
                if (error) {
                    callback(error);
                    return;
                }

                autoship.shippingAddress = address;
                autoship.ship_address_id = address.id;
                callback();
            });
        },

        function (callback) {
            // save billing address
            addressDao.createBillingAddress(options.billingAddress, function (error, address) {
                if (error) {
                    callback(error);
                    return;
                }

                autoship.billingAddress = address;
                autoship.bill_address_id = address.id;
                callback();
            });
        },

        function (callback) {
            getUserOfAutoship(context, autoship, function (error) {
                callback(error);
            });
        },

        function (callback) {
            if (options.nextAutoshipDate) {
                autoship.next_autoship_date = options.nextAutoshipDate;
            } else {
                var now = new Date();
                autoship.next_autoship_date = getNextAutoshipDate(now,
                    autoship.active_date,
                    autoship.frequency_by_month,
                    autoship.start_date,
                    autoship.last_autoship_date);
            }

            context.models.Autoship.create(autoship).done(callback);
        },

        function (newAutoship, callback) {
            newAutoship.user = autoship.user;
            autoship = newAutoship;

            saveAutoshipItems(context, autoship, options.autoshipItems, function (error, autoshipItems) {
                if (error) {
                    callback(error);
                    return;
                }

                autoship.autoshipItems = autoshipItems;
                callback();
            });
        },

        function (callback) {
            saveAutoshipAdjustments(context, autoship, options.autoshipAdjustments, function (error, autoshipAdjustments) {
                if (error) {
                    callback(error);
                    return;
                }

                autoship.autoshipAdjustments = autoshipAdjustments;
                callback();
            });
        },

        function (callback) {
            var paymentInfo = {
                paymentMethodId : options.paymentMethodId,
                creditcard : options.creditcard
            };
            setPaymentOfAutoship(context, autoship, paymentInfo, callback);
        },

        function (callback) {
            callback(null, autoship);
        }
    ], callback);
};


Autoship.prototype.updateAutoship = function (options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        addressDao = daos.createDao('Address', context),
        autoship,
        error;

    // check parameters
    if (!options.billingAddress) {
        error = new Error('Billing address is required.');
        error.errorCode = 'InvalidBillingAddress';
        callback(error);
        return;
    }

    if (!options.shippingAddress) {
        error = new Error('Shipping address is required.');
        error.errorCode = 'InvalidShippingAddress';
        callback(error);
        return;
    }

    if (!options.shippingMethodId) {
        error = new Error('Shipping method id is required.');
        error.errorCode = 'InvalidShippingMethodId';
        callback(error);
        return;
    }

    async.waterfall([
        function (callback) {
            context.models.Autoship.find(options.autoshipId).done(function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                autoship = result;

                if (!autoship) {
                    error = new Error("Autoship with id " + options.autoshipId + " does not exist.");
                    error.errorCode = 'InvalidAutoshipId';
                    error.statusCode = 404;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            validateAutoshipItems(context, options.autoshipItems, callback);
        },

        function (callback) {
            var orderDao = daos.createDao('Order', context),
                validateOrderOptions = {
                    lineItems : options.autoshipItems,
                    shippingMethodId : options.shippingMethodId,
                    shippingAddress : options.shippingAddress,
                    paymentMethodId : options.paymentMethodId,
                    billingAddress : options.billingAddress
                };
            orderDao.validateOrder(validateOrderOptions, callback);
        },

        function (callback) {
            // save shipping address
            addressDao.createShippingAddress(options.shippingAddress, function (error, address) {
                if (error) {
                    callback(error);
                    return;
                }

                autoship.shippingAddress = address;
                autoship.ship_address_id = address.id;
                callback();
            });
        },

        function (callback) {
            // save billing address
            addressDao.createBillingAddress(options.billingAddress, function (error, address) {
                if (error) {
                    callback(error);
                    return;
                }

                autoship.billingAddress = address;
                autoship.bill_address_id = address.id;
                callback();
            });
        },

        function (callback) {
            getUserOfAutoship(context, autoship, function (error) {
                callback(error);
            });
        },

        function (callback) {
            if (!autoship.next_autoship_date ||
                    !options.nextAutoshipDate ||
                    autoship.next_autoship_date.getTime() === options.nextAutoshipDate.getTime()) {
                callback();
                return;
            }

            var nextAutoshipDate = options.nextAutoshipDate,
                firstDayOfNextAutoshipMonth = new Date(nextAutoshipDate.getFullYear(), nextAutoshipDate.getMonth(), 1),
                firstDayOfNextNextAutoshipMonth = new Date(nextAutoshipDate.getFullYear(), nextAutoshipDate.getMonth() + 1, 1),
                queryDatabaseOptions = {
                    sqlStmt: "select count(*) from orders where autoship_id = $1 and order_date >= $2 and order_date < $3 and state = 'complete'",
                    sqlParams: [autoship.id, firstDayOfNextAutoshipMonth, firstDayOfNextNextAutoshipMonth]
                };
            DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                var count = result.rows[0].count;
                if (count) {
                    error = new Error("This autoship order has been shipped this month and should not be ship again in the same month.");
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            autoship.shipping_method_id = options.shippingMethodId;
            autoship.active_date = options.activeDate || 7;
            autoship.start_date = options.startDate;
            autoship.frequency_by_month = options.frequencyByMonth || 1;

            if (options.nextAutoshipDate) {
                autoship.next_autoship_date = options.nextAutoshipDate;
            } else {
                var now = new Date();
                autoship.next_autoship_date = getNextAutoshipDate(now,
                    autoship.active_date,
                    autoship.frequency_by_month,
                    autoship.start_date,
                    autoship.last_autoship_date);
            }

            autoship.save(['ship_address_id', 'bill_address_id', 'active_date', 'start_date', 'frequency_by_month', 'next_autoship_date', 'shipping_method_id']).done(callback);
        },

        function (savedAutoship, callback) {
            savedAutoship.user = autoship.user;
            autoship = savedAutoship;

            clearAutoshipItemsOfAutoship(context, autoship, callback);
        },

        function (callback) {
            saveAutoshipItems(context, autoship, options.autoshipItems, callback);
        },

        function (autoshipItems, callback) {
            autoship.autoshipItems = autoshipItems;

            if (!options.paymentMethodId && !options.creditcard) {
                callback();
                return;
            }

            var paymentInfo = {
                paymentMethodId : options.paymentMethodId,
                creditcard : options.creditcard
            };
            setPaymentOfAutoship(context, autoship, paymentInfo, callback);
        },

        function (callback) {
            callback(null, autoship);
        }
    ], callback);
};


/*
 * Delete the autoship and related records in database by id.
 */
Autoship.prototype.deleteAutoshipById = function (autoshipId, callback) {
    var context = this.context;

    async.waterfall([
        function (callback) {
            var tables = [
                    'autoship_items',
                    'autoship_payments'
                ];
            async.forEachSeries(tables, function (eachTable, callback) {

                var options = {
                        useWriteDatabase : true,
                        sqlStmt : 'DELETE FROM ' + eachTable + ' WHERE autoship_id = $1',
                        sqlParams : [autoshipId]
                    };
                DAO.queryDatabase(context, options, function (error) {
                    callback(error);
                });
            }, function (error) {
                callback(error);
            });
        },

        function (callback) {
            var options = {
                    useWriteDatabase : true,
                    sqlStmt : 'DELETE FROM autoships WHERE id = $1',
                    sqlParams : [autoshipId]
                };
            DAO.queryDatabase(context, options, function (error) {
                callback(error);
            });
        }
    ], callback);
};


/*
 *  options = {
 *      autoshipId : <Integer>  // required
 *  }
 */
Autoship.prototype.cancelAutoship = function (options, callback) {
    var context = this.context,
        logger = context.logger,
        autoship,
        userId = context.user.userId;

    logger.debug("Cancelling autoship " + options.autoshipId);

    async.waterfall([
        function (callback) {
            context.models.Autoship.find(options.autoshipId).done(callback);
        },

        function (result, callback) {
            autoship = result;

            if (!autoship) {
                error = new Error("Autoship with id " + options.autoshipId + " not found.");
                error.errorCode = 'InvalidAutoshipId';
                error.statusCode = 404;
                callback(error);
                return;
            }

            var userDao = daos.createDao('User', context);
            userDao.getCurrentOperator(function (error, operator) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!operator.isAdmin && autoship.user_id !== operator.id) {
                    error = new Error("No permission to cancel the autoship.");
                    error.errorCode = 'NoPermissionToCancelAutoship';
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            if (autoship.state === 'cancelled') {
                callback();
                return;
            }

            autoship.state = 'cancelled';
            autoship.save(['state']).done(function (error) {
                callback();
            });
        }
    ], callback);
};


/*
 * Get the autoship list of user.
 *  options = {
 *      state : <String> // optional
 *  }
 */
Autoship.prototype.getAutoships = function (options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        userId = context.user.userId;

    logger.debug("Getting autoships...");

    async.waterfall([
        function (next) {
            var where = {
                    user_id : userId
                };

            if (options.state) {
                where.state = options.state;
            }

            context.readModels.Autoship.findAll({
                where : where
            }).done(function (error, autoships) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!autoships.length) {
                    callback(null, []);
                    return;
                }

                next(null, autoships);
            });
        },

        function (autoships, callback) {
            var autoshipsWithDetails = [];

            async.forEachSeries(autoships, function (autoship, callback) {
                var getAutoshipDetailsOptions = {
                        autoshipId : autoship.id
                    };
                self.getAutoshipDetails(getAutoshipDetailsOptions, function (error, autoship) {
                    if (error) {
                        callback();
                        return;
                    }

                    autoshipsWithDetails.push(autoship);
                    callback();
                });
            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, autoshipsWithDetails);
            });
        }
    ], callback);
};


/*
 *  options = {
 *      autoshipId : <Integer>
 *  }
 */
Autoship.prototype.getAutoshipDetails = function (options, callback) {
    var context = this.context,
        autoship;

    async.waterfall([
        function (next) {
            context.readModels.Autoship.find(options.autoshipId).done(function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                autoship = result;
                if (!autoship) {
                    callback(null, null);
                    return;
                }

                next();
            });
        },

        function (callback) {
            getShippingAddressOfAutoship(context, autoship, function (error) {
                callback(error);
            });
        },

        function (callback) {
            getBillingAddressOfAutoship(context, autoship, function (error) {
                callback(error);
            });
        },

        function (callback) {
            // get autoship items
            context.readModels.AutoshipItem.findAll({
                where : {
                    autoship_id : autoship.id
                }
            }).done(function (error, autoshipItems) {
                autoship.autoshipItems = autoshipItems;
                callback();
            });
        },

        function (callback) {
            // get autoship adjustments
            context.readModels.AutoshipAdjustment.findAll({
                where : {
                    autoship_id : autoship.id
                }
            }).done(function (error, autoshipAdjustments) {
                autoship.autoshipAdjustments = autoshipAdjustments;
                callback();
            });
        },

        function (callback) {
            var orderDao = daos.createDao('Order', context),
                checkoutOrderOptions = {
                    userId : autoship.user_id,
                    autoship : true,
                    lineItems : autoship.autoshipItems.map(function (autoshipItem) {
                        return {
                            catalogCode : autoshipItem.catalog_code || 'AT',
                            roleId : autoshipItem.role_id,
                            variantId : autoshipItem.variant_id,
                            quantity : autoshipItem.quantity
                        };
                    }),
                    additionalAdjustments : u.filter(autoship.autoshipAdjustments, function (item) {
                        return item.active;
                    }),
                    shippingMethodId : autoship.shipping_method_id,
                    shippingAddress : autoship.shippingAddress,
                    billingAddress : autoship.billingAddress
                };

            orderDao.checkoutOrder(checkoutOrderOptions, function (error, order) {
                if (error) {
                    callback(error);
                    return;
                }

                autoship.autoshipItems = order.autoshipItems;
                autoship.adjustments = order.adjustments;

                autoship.item_total = order.item_total;
                autoship.adjustment_total = order.adjustment_total;
                autoship.total = order.total;

                if (order.autoshipItems) {
                    autoship.qualification_volume = order.autoshipItems.reduce(function (sum, lineItem) {
                        return sum + lineItem.q_volume;
                    }, 0);
                }

                autoship.availableShippingMethods = order.availableShippingMethods;
                autoship.availablePaymentMethods = order.availablePaymentMethods;

                callback();
            });
        },

        function (callback) {
            // get creditcard info
            getActiveAutoshipPayment(context, autoship, function (error, autoshipPayment) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!autoshipPayment || !autoshipPayment.creditcard_id) {
                    callback();
                    return;
                }

                var creditcardDao = daos.createDao('Creditcard', context);
                creditcardDao.getById(autoshipPayment.creditcard_id, function (error, creditcard) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!creditcard) {
                        callback();
                        return;
                    }

                    autoship.creditcardLastDigits = creditcard.last_digits;
                    callback();
                });
            });
        },

        function (callback) {
            callback(null, autoship);
        }
    ], callback);
};

Autoship.prototype.getAutoshipItems = function (autoshipId, callback) {
    var context = this.context;

    context.readModels.AutoshipItem.findAll({
        where : {
            autoship_id : autoshipId
        }
    }).done(callback);
};

Autoship.prototype.getAutoshipAdjustmentsByAutoshipId = function (autoshipId, callback) {
    var context = this.context;

    context.readModels.AutoshipAdjustment.findAll({
        where : {
            autoship_id : autoshipId
        }
    }).done(callback);
};

Autoship.getNextAutoshipDate = getNextAutoshipDate;

module.exports = Autoship;

var async = require('async');
var moment = require('moment');
var daos = require('../daos');
var CreditcardDao = require('../daos/Creditcard');

var limit = {
    firstTimeOrder : {
        DEFAULT : 2000,
        GB : 200,
        DO : 1000,
        IT : 3600,
        AU : -1,    // no limit
        NZ : -1,
        MY : 2000 * 3,
        M1 : 2000 * 3,
        PH : 2000 * 40,
        TW : 2000 * 30,
        RU : 2000 * 32,
        KZ : 2000 * 32,
        UA : 2000 * 8.1,
        JP : 2000 * 90,
        TH : 2000 * 30
    },

    secondTimeOrder : {
        DEFAULT : 2500,
        DO : 1000,
        IT : 3600,
        AU : -1,
        NZ : -1,
        MY : 2500 * 3,
        M1 : 2500 * 3,
        PH : 2500 * 40,
        TW : 2500 * 30,
        RU : 2500 * 32,
        KZ : 2500 * 32,
        UA : 2500 * 8.1,
        JP : 2500 * 90,
        TH : 2500 * 30
    },

    daily : {
        creditcard : {
            DEFAULT : 3500,
            IT : 3600,
            AU : -1,
            NZ : -1,
            MY : 3500 * 3,
            M1 : 3500 * 3,
            PH : 3500 * 40,
            TW : 3500 * 30,
            RU : 3500 * 32,
            KZ : 3500 * 32,
            UA : 3500 * 8.1,
            JP : 3500 * 90,
            TH : 3500 * 30
        },

        orderAmount : {
            DEFAULT : 2500,
            IT : 3600,
            AU : -1,
            NZ : -1,
            MY : 2500 * 3,
            M1 : 2500 * 3,
            PH : 2500 * 40,
            TW : 2500 * 30,
            RU : 2500 * 32,
            KZ : 2500 * 32,
            UA : 2500 * 8.1,
            JP : 2500 * 90,
            TH : 2500 * 30
        }
    },

    weekly : {
        creditcard : {
            DEFAULT : 5000,
            IT : 3600,
            AU : -1,
            NZ : -1,
            MY : 5000 * 3,
            M1 : 5000 * 3,
            PH : 5000 * 40,
            TW : 5000 * 30,
            RU : 5000 * 32,
            KZ : 5000 * 32,
            UA : 5000 * 8.1,
            JP : 5000 * 90,
            TH : 5000 * 30
        },

        orderAmount : {
            DEFAULT : 5000,
            IT : 3600,
            AU : -1,
            NZ : -1,
            MY : 5000 * 3,
            M1 : 5000 * 3,
            PH : 5000 * 40,
            TW : 5000 * 30,
            RU : 5000 * 32,
            KZ : 5000 * 32,
            UA : 5000 * 8.1,
            JP : 5000 * 90,
            TH : 5000 * 30
        }
    },

    yearly : {
        orderAmount : {
            IT : 3600,
            AU : -1,
            NZ : -1
        }
    }
};


function checkIsOver(context, order, payment, checkPoints, saveFraudPreventionEvent, callback) {
    var logger = context.logger;

    async.forEachSeries(checkPoints, function (eachCheckPoint, next) {
        eachCheckPoint(context, order, payment, saveFraudPreventionEvent, function (error, isOver) {
            if (error) {
                callback(error);
                return;
            }

            if (isOver) {
                logger.debug('Fraud prevention check: DENIED.');
                callback(null, true);
                return;
            }

            next();
        });

    }, function (error) {
        if (error) {
            callback(error);
            return;
        }

        logger.debug('Fraud prevention check: PASS.');
        callback(null, false);
    });
}


function getAmountInHomeCountryCurrency(context, homeCountryCurrencyId, orderCurrencyId, amount, callback) {
    if (homeCountryCurrencyId === orderCurrencyId) {
        callback(null, amount);
        return;
    }

    var clientFXRateDao = daos.createDao('ClientFXRate', context);
    async.series({
        rateOfOrder : function (callback) {
            clientFXRateDao.getConvertRateOfCurrency(orderCurrencyId, callback);
        },

        rateOfHome : function (callback) {
            clientFXRateDao.getConvertRateOfCurrency(homeCountryCurrencyId, callback);
        }

    }, function (error, rates) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, amount * rates.rateOfHome / rates.rateOfOrder);
    });
}


function getPaymentAmountInHomeCountryCurrency(context, order, payment, callback) {
    if (payment.amountInHomeCountryCurrency) {
        callback(null, payment.amountInHomeCountryCurrency);
        return;
    }

    getAmountInHomeCountryCurrency(
        context,
        order.userCountry.currency_id,
        order.currency_id,
        payment.amount,
        function (error, amount) {
            if (error) {
                callback(error);
                return;
            }
            payment.amountInHomeCountryCurrency = amount;
            callback(null, amount);
        }
    );
}


function getFirstTimeOrderLimit(countryIso, callback) {
    callback(null, limit.firstTimeOrder[countryIso] || limit.firstTimeOrder.DEFAULT);
}


function getSecondTimeOrderLimit(countryIso, callback) {
    callback(null, limit.secondTimeOrder[countryIso] || limit.secondTimeOrder.DEFAULT);
}


function getPerOrderLimit(context, order, callback) {
    var userDao = daos.createDao('User', context);

    async.waterfall([
        function (callback) {
            userDao.isUserUnregistered(order.user, callback);
        },

        function (isUnregistered, callback) {
            if (isUnregistered) {
                getFirstTimeOrderLimit(order.userCountry.iso, callback);
            } else {
                getSecondTimeOrderLimit(order.userCountry.iso, callback);
            }
        }
    ], callback);
}


function getDailyOrderAmountLimit(context, order, callback) {
    var countryIso = order.userCountry.iso,
        rule = limit.daily.orderAmount;

    callback(null, rule[countryIso] || rule.DEFAULT);
}


function getWeeklyOrderAmountLimit(context, order, callback) {
    var countryIso = order.userCountry.iso,
        rule = limit.weekly.orderAmount;

    callback(null, rule[countryIso] || rule.DEFAULT);
}


function getYearlyOrderAmountLimit(context, order, callback) {
    var countryIso = order.userCountry.iso,
        rule = limit.yearly.orderAmount;

    callback(null, rule[countryIso] || rule.DEFAULT);
}


function getDailyCreditcardLimit(context, order, callback) {
    var countryIso = order.userCountry.iso,
        rule = limit.daily.creditcard;

    callback(null, rule[countryIso] || rule.DEFAULT);
}


function getWeeklyCreditcardLimit(context, order, callback) {
    var countryIso = order.userCountry.iso,
        rule = limit.weekly.creditcard;

    callback(null, rule[countryIso] || rule.DEFAULT);
}


function dealWithCurrentAmountOverLimit(context, order, payment, limitType, limitAmount, currentAmount, orderStartDate, callback) {
    var logger = context.logger,
        fraudPreventionEventDao = daos.createDao('FraudPreventionEvent', context),
        reason = limitType,
        detail = 'current payment(' + currentAmount + ') orver limit(' + limitAmount + ')',
        fraudPreventionEvent = {
            order_id : order.id,
            order_start_date : orderStartDate,
            payment_id : payment.id,
            reason : reason,
            detail : detail
        };

    logger.error('ERROR: FraudPrevention over ' + reason + ', ' + detail + ', order id(' + order.id + '), date(' + orderStartDate + ')');
    fraudPreventionEventDao.createFraudPreventionEvent(fraudPreventionEvent, function (error) {
        if (error) {
            logger.error('error when creating fraud prevention event. %s', error.message);
        }

        callback();
    });
}

function dealWithTotalAmountOverLimit(context, order, payment, limitType, limitAmount, currentAmount, previousAmount, orderStartDate, callback) {
    var logger = context.logger,
        fraudPreventionEventDao = daos.createDao('FraudPreventionEvent', context),
        reason = limitType,
        detail = 'total previous payments(' + previousAmount + ') + current payment(' + currentAmount + ') over limit(' + limitAmount + ')',
        fraudPreventionEvent = {
            order_id : order.id,
            order_start_date : orderStartDate,
            payment_id : payment.id,
            reason : reason,
            detail : detail
        };

    logger.error('ERROR: FraudPrevention over ' + reason + ', ' + detail + ', order id(' + order.id + '), date(' + orderStartDate + ')');
    fraudPreventionEventDao.createFraudPreventionEvent(fraudPreventionEvent, function (error) {
        if (error) {
            logger.error('error when creating fraud prevention event. %s', error.message);
        }

        callback();
    });
}


function isOverLimit(context, order, payment, limitType, getLimitAmoutMethod, getPreviousAmountMethod, orderStartDate, saveFraudPreventionEvent, callback) {
    var currentAmount,
        previousAmount,
        limitAmount;

    async.waterfall([
        function (next) {
            // get the limit amout
            getLimitAmoutMethod(context, order, function (error, limit) {
                if (error) {
                    callback(error);
                    return;
                }

                if (limit === -1) {
                    // no limit
                    callback(null, false);
                    return;
                }

                limitAmount = limit;
                next();
            });
        },

        function (callback) {
            // get current payment amout
            getPaymentAmountInHomeCountryCurrency(context, order, payment, function (error, amount) {
                if (error) {
                    callback(error);
                    return;
                }

                currentAmount = amount;
                callback();
            });
        },

        function (next) {
            // check if current payment amount is over limit
            if (currentAmount > limitAmount) {
                if (!saveFraudPreventionEvent) {
                    callback(null, true);
                    return;
                }

                dealWithCurrentAmountOverLimit(context, order, payment, limitType, limitAmount, currentAmount, orderStartDate, function () {
                    // over limit, callback now.
                    callback(null, true);
                });
                return;
            }

            next();
        },

        function (next) {
            // check if we need to check previous total amount.
            if (!getPreviousAmountMethod) {
                callback(null, false);
                return;
            }

            getPreviousAmountMethod(context, orderStartDate, order.userCountry.currency_id, function (error, amount) {
                if (error) {
                    callback(error);
                    return;
                }

                previousAmount = amount;
                callback();
            });
        },

        function (callback) {
            // check if total payment amount is over limit
            if (previousAmount + currentAmount > limitAmount) {
                if (!saveFraudPreventionEvent) {
                    callback(null, true);
                    return;
                }

                dealWithTotalAmountOverLimit(context, order, payment, limitType, limitAmount, currentAmount, previousAmount, orderStartDate, function () {
                    callback(null, true);
                });
                return;
            }

            callback(null, false);
        }
    ], callback);
}


function isOverPerOrderLimit(context, order, payment, saveFraudPreventionEvent, callback) {
    isOverLimit(context, order, payment, 'PerOrderLimit', getPerOrderLimit, null, new Date(), saveFraudPreventionEvent, callback);
}


function getPaidOrdersOfUser(context, userId, orderStartDate, callback) {
    var where = [
            "user_id = ? AND state = 'complete' AND payment_state IN ('paid', 'credit_owed') AND order_date >= ?",
            userId,
            orderStartDate
        ];

    context.readModels.Order.findAll({where : where}).success(function (orders) {
        callback(null, orders);
    }).error(callback);
}


function getPreviousOrderAmount(context, userId, orderStartDate, homeCountryCurrencyId, callback) {
    async.waterfall([
        function (callback) {
            getPaidOrdersOfUser(context, userId, orderStartDate, callback);
        },

        function (paidOrders, callback) {
            var totalAmount = 0;

            async.forEachSeries(paidOrders, function (order, callback) {
                getAmountInHomeCountryCurrency(
                    context,
                    homeCountryCurrencyId,
                    order.currency_id,
                    order.total,
                    function (error, amount) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        totalAmount += amount || 0;
                        callback();
                    }
                );

            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, totalAmount);
            });
        }
    ], callback);
}


function generateGetPreviousOrderAmountFunction(userId) {
    return function (context, orderStartDate, homeCountryCurrencyId, callback) {
        getPreviousOrderAmount(context, userId, orderStartDate, homeCountryCurrencyId, callback);
    };
}


function getPreviousCreditcardAmount(context, creditcardId, orderStartDate, homeCountryCurrencyId, callback) {
    async.waterfall([
        function (callback) {
            var creditcardDao = daos.createDao('Creditcard', context);
            creditcardDao.getCreditcardById(creditcardId, callback);
        },

        function (creditcard, callback) {
            var logger = context.logger,
                expirationMonth = creditcard.month,
                expirationYear = creditcard.year,
                sqlStmt = "SELECT SUM(p.amount), o.currency_id " +
                    "FROM orders o, payments p, creditcards cc " +
                    "WHERE o.id = p.order_id AND " +
                    "p.source_id = cc.id AND " +
                    "p.state= 'completed' AND " +
                    "p.source_type = 'Creditcard' AND " +
                    "o.order_date >= $1 AND " +
                    "cc.last_digits = $2 AND " +
                    "cc.month = $3 AND " +
                    "cc.year = $4 " +
                    "GROUP BY o.currency_id",
                sqlParams = [orderStartDate, creditcard.last_digits, expirationMonth, expirationYear];

            logger.trace(
                'Executing sql query: %s with sqlParams %j',
                sqlStmt,
                sqlParams
            );
            context.readDatabaseClient.query(
                sqlStmt,
                sqlParams,
                function (error, result) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    callback(null, result.rows);
                }
            );
        },

        function (amountCurrencies, callback) {
            var totalAmount = 0;

            async.forEachSeries(amountCurrencies, function (amountCurrency, callback) {
                getAmountInHomeCountryCurrency(
                    context,
                    homeCountryCurrencyId,
                    amountCurrency.currency_id,
                    parseFloat(amountCurrency.sum),
                    function (error, amount) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        totalAmount += amount || 0;
                        callback();
                    }
                );

            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, totalAmount);
            });
        }
    ], callback);
}


function getPreviousCreditcardAmountByHashSignature(context, hashSignature, orderStartDate, homeCountryCurrencyId, callback) {
    async.waterfall([
        function (callback) {
            var logger = context.logger,
                sqlStmt = "SELECT SUM(p.amount), o.currency_id " +
                    "FROM orders o, payments p, creditcards cc " +
                    "WHERE o.id = p.order_id AND " +
                    "p.source_id = cc.id AND " +
                    "p.state= 'completed' AND " +
                    "p.source_type = 'Creditcard' AND " +
                    "o.order_date >= $1 AND " +
                    "cc.hash_signature = $2 AND " +
                    "GROUP BY o.currency_id",
                sqlParams = [orderStartDate, hashSignature];

            logger.trace(
                'Executing sql query: %s with sqlParams %j',
                sqlStmt,
                sqlParams
            );
            context.readDatabaseClient.query(
                sqlStmt,
                sqlParams,
                function (error, result) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    callback(null, result.rows);
                }
            );
        },

        function (amountCurrencies, callback) {
            var totalAmount = 0;

            async.forEachSeries(amountCurrencies, function (amountCurrency, callback) {
                getAmountInHomeCountryCurrency(
                    context,
                    homeCountryCurrencyId,
                    amountCurrency.currency_id,
                    parseFloat(amountCurrency.sum),
                    function (error, amount) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        totalAmount += amount || 0;
                        callback();
                    }
                );

            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, totalAmount);
            });
        }
    ], callback);
}


function generateGetPreviousCreditcardAmountFunction(creditcardId) {
    return function (context, orderStartDate, homeCountryCurrencyId, callback) {
        getPreviousCreditcardAmount(context, creditcardId, orderStartDate, homeCountryCurrencyId, callback);
    };
}


function generateGetPreviousCreditcardAmountByHashSignatureFunction(hashSignature) {
    return function (context, orderStartDate, homeCountryCurrencyId, callback) {
        getPreviousCreditcardAmountByHashSignature(context, hashSignature, orderStartDate, homeCountryCurrencyId, callback);
    };
}


function isOverPeriodOrderAmountLimit(context, order, payment, periodType, saveFraudPreventionEvent, callback) {
    var limitType,
        orderStartDate,
        getLimitAmoutMethod,
        getPreviousAmountMethod;

    switch (periodType) {
    case 'daily':
        limitType = 'DailyOrderLimit';
        orderStartDate = moment().subtract('days', 1).toDate();
        getLimitAmoutMethod = getDailyOrderAmountLimit;
        break;
    case 'weekly':
        limitType = 'WeeklyOrderLimit';
        orderStartDate = moment().subtract('weeks', 1).toDate();
        getLimitAmoutMethod = getWeeklyOrderAmountLimit;
        break;
    case 'yearly':
        limitType = 'YearlyOrderLimit';
        orderStartDate = moment().subtract('years', 1).toDate();
        getLimitAmoutMethod = getYearlyOrderAmountLimit;
        break;
    }

    getPreviousAmountMethod = generateGetPreviousOrderAmountFunction(order.user.id);
    isOverLimit(context, order, payment, limitType, getLimitAmoutMethod, getPreviousAmountMethod, orderStartDate, saveFraudPreventionEvent, callback);
}


function isOverPeriodCreditcardLimit(context, order, payment, periodType, saveFraudPreventionEvent, callback) {
    var limitType,
        orderStartDate,
        getLimitAmoutMethod,
        getPreviousAmountMethod;

    switch (periodType) {
    case 'daily':
        limitType = 'DailyCreditLimit';
        orderStartDate = moment().subtract('days', 1).toDate();
        getLimitAmoutMethod = getDailyCreditcardLimit;
        break;
    case 'weekly':
        limitType = 'WeeklyCreditLimit';
        orderStartDate = moment().subtract('weeks', 1).toDate();
        getLimitAmoutMethod = getWeeklyCreditcardLimit;
        break;
    }

    if (payment.source_hash_signature) {
        getPreviousAmountMethod = generateGetPreviousCreditcardAmountByHashSignatureFunction(payment.source_hash_signature);
    } else {
        getPreviousAmountMethod = generateGetPreviousCreditcardAmountFunction(payment.source_id);
    }
    isOverLimit(context, order, payment, limitType, getLimitAmoutMethod, getPreviousAmountMethod, orderStartDate, saveFraudPreventionEvent, callback);
}


function isOverDailyOrderAmountLimit(context, order, payment, saveFraudPreventionEvent, callback) {
    isOverPeriodOrderAmountLimit(context, order, payment, 'daily', saveFraudPreventionEvent, callback);
}


function isOverWeeklyOrderAmountLimit(context, order, payment, saveFraudPreventionEvent, callback) {
    isOverPeriodOrderAmountLimit(context, order, payment, 'weekly', saveFraudPreventionEvent, callback);
}


function isOverYearlyOrderAmountLimit(context, order, payment, saveFraudPreventionEvent, callback) {
    isOverPeriodOrderAmountLimit(context, order, payment, 'yearly', saveFraudPreventionEvent, callback);
}


function isOverDailyCreditcardLimit(context, order, payment, saveFraudPreventionEvent, callback) {
    isOverPeriodCreditcardLimit(context, order, payment, 'daily', saveFraudPreventionEvent, callback);
}


function isOverWeeklyCreditcardLimit(context, order, payment, saveFraudPreventionEvent, callback) {
    isOverPeriodCreditcardLimit(context, order, payment, 'weekly', saveFraudPreventionEvent, callback);
}


function fraudPreventionCheck(context, order, payment, saveFraudPreventionEvent, callback) {
    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getCountryOfUser(order.user, callback);
        },

        function (country, next) {
            if (!country) {
                callback(null, true);
                return;
            }

            order.userCountry = country;

            if (country.iso === 'AU' || country.iso === 'NZ') {
                callback(null, true);
                return;
            }

            if (country.iso === 'IT') {
                isOverYearlyOrderAmountLimit(context, order, payment, saveFraudPreventionEvent, function (error, isOver) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    callback(null, !isOver);
                });
                return;
            }

            if (payment.source_type !== 'Creditcard') {
                callback(null, true);
                return;
            }

            next();
        },

        function (callback) {
            checkIsOver(context, order, payment, [
                isOverPerOrderLimit,
                isOverDailyOrderAmountLimit,
                isOverWeeklyOrderAmountLimit,
                isOverDailyCreditcardLimit,
                isOverWeeklyCreditcardLimit
            ], saveFraudPreventionEvent, function (error, isOver) {
                if (error) {
                    callback(error);
                    return;
                }
                callback(null, !isOver);
            });
        }
    ], callback);
}


// check if the payment amount is over limit
function isPaymentAllowed(context, order, payment, callback) {
    fraudPreventionCheck(context, order, payment, true, callback);
}

function isPurchaseAllowed(context, options, callback) {
    var userLogin = options.userLogin,
        orderAmount = options.orderAmount,
        creditcardNumber = options.creditcardNumber,
        countryIso = options.countryIso,
        order = {
            total : orderAmount
        },
        payment = {
            amount : orderAmount
        };

    if (creditcardNumber) {
        payment.source_type = 'Creditcard';
        payment.source_hash_signature = CreditcardDao.generateHashSignature(creditcardNumber);
    }

    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getUserByLogin(userLogin, function (error, user) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!user) {
                    error = new Error('User not found.');
                    error.errorCode = 'InvalidUserLogin';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                order.user = user;
                callback();
            });
        },

        function (callback) {
            var countryDao = daos.createDao('Country', context);
            countryDao.getCountryByIso(countryIso, function (error, country) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!country) {
                    error = new Error('Country not found.');
                    error.errorCode = 'InvalidCountryISO';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                order.currency_id = country.currency_id;
                callback();
            });
        },

        function (callback) {
            fraudPreventionCheck(context, order, payment, false, callback);
        }
    ], callback);
}


function isPurchaseAllowedForRegistration(context, options, callback) {
    var orderAmount = options.orderAmount,
        countryIso = options.countryIso;

    async.waterfall([
        function (callback) {
            getFirstTimeOrderLimit(countryIso, callback);
        },

        function (amountLimit, callback) {
            if (amountLimit === -1) {
                callback(null, true);
                return;
            }

            var isAllowed = (orderAmount <= amountLimit);
            callback(null, isAllowed);
        }
    ], callback);
}

exports.isPaymentAllowed = isPaymentAllowed;
exports.getFirstTimeOrderLimit = getFirstTimeOrderLimit;
exports.isPurchaseAllowedForRegistration = isPurchaseAllowedForRegistration;

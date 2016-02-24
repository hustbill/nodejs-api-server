var async = require('async');
var crypto = require('crypto');
var request = require('request');
var sidedoor = require('sidedoor');
var u = require('underscore');
var daos = require('../../daos/index');
var OrderDao = require('../../daos/Order');
var PaymentDao = require('../../daos/Payment');
var statsdHelper = require('../../lib/statsdHelper');
var airbrakeHelper = require('../../lib/airbrakeHelper');


function isValidCardType(creditcardType) {
    if (creditcardType === 'visa' ||
            creditcardType === 'mastercard' ||
            creditcardType === 'amex' ||
            creditcardType === 'jcb' ||
            creditcardType === 'maestro' ||
            creditcardType === 'discover') {
        return true;
    }

    return false;
}

function getCreditcardData(creditcard) {
    return {
        number : creditcard.number,
        "expiry-year" : creditcard.year,
        "expiry-month" : creditcard.month,
        cvv : creditcard.cvv
    };
}


function getBillingAddressData(address) {
    return {
        'first-name' : address.firstname,
        'last-name' : address.lastname,
        street : address.address1,
        'street-cont' : address.address2 || '',
        city: address.city,
        zip : address.zipcode || '',
        state : (address.state && address.state.name) || '',
        'state-abbr' : (address.state && address.state.abbr) || '',
        'country-iso' : address.country.iso,
        phone : address.phone || ''
    };
}


function getAdditionalDataOfIPay(context, order, payment, callback) {
    var data = {
            'distributor-id' : context.user.distributorId,
            'billing-address-country-iso3' : order.billingAddress.country.iso3
        };

    callback(null, data);
}


function getOrderSkus(order) {
    var skus = order.lineItems.map(function (lineItem) {
        return lineItem.variant.sku;
    });

    return skus.join('&');
}


function getVerifyShippingAddressData(address) {
    return {
        company : 'Organo Gold',
        'first-name' : address.firstname,
        'last-name' : address.lastname,
        street : address.address1,
        'street-cont' : address.address2 || '',
        city: address.city,
        zip : address.zipcode,
        state : address.state.name,
        'country-iso' : address.country.iso
    };
}


function getAdditionalDataOfVerifi(context, order, payment, callback) {
    var orderDao = daos.createDao('Order', context),
        data = {
            'distributor-id' : context.user.distributorId,
            'shipping-method-name' : null,
            'shipping-company' : 'Organo Gold',
            'order-skus' : getOrderSkus(order),
            'email' : order.user.email,
            'ip' : "", // comment out "context.remoteAddress", Verifi uses Neustar, some IPs might be in their Countries to Decline list
            'order-description' : '',
            'shipping-address' : getVerifyShippingAddressData(order.shippingAddress)
        };

    orderDao.getShippingMethodOfOrder(order, function (error, shippingMethod) {
        if (error) {
            callback(error);
            return;
        }

        data['shipping-method-name'] = shippingMethod.name;
        callback(null, data);
    });
}


function getAdditionalDataOfWorldpay(context, order, payment, callback) {
    async.waterfall([
        function (callback) {
            var countryDao = daos.createDao('Country', context);
            countryDao.getCountryById(order.shippingAddress.country_id, callback);
        },

        function (country, callback) {
            if (!country) {
                var error = new Error("Can't get country of order.");
                callback(error);
                return;
            }

            var currencyDao = daos.createDao('Currency', context);
            currencyDao.getCurrencyById(country.currency_id, callback);
        },

        function (currency, callback) {
            if (!currency) {
                var error = new Error("Can't get currency of order.");
                callback(error);
                return;
            }

            var data = {
                    "currency-code" : currency.iso_code
                };

            callback(null, data);
        }
    ], callback);
}

function getAdditionalDataOfPaymentExpress(context, order, payment, callback) {
    async.waterfall([
        function (callback) {
            var countryDao = daos.createDao('Country', context);
            countryDao.getCountryById(order.shippingAddress.country_id, callback);
        },

        function (country, callback) {
            if (!country) {
                var error = new Error("Can't get country of order.");
                callback(error);
                return;
            }

            var currencyDao = daos.createDao('Currency', context);
            currencyDao.getCurrencyById(country.currency_id, callback);
        },

        function (currency, callback) {
            if (!currency) {
                var error = new Error("Can't get currency of order.");
                callback(error);
                return;
            }

            var data = {
                    "currency-code" : currency.iso_code
                };

            callback(null, data);
        }
    ], callback);
}


function getPaymentTokenByAutoshipPaymentId(context, autoshipPaymentId, callback) {
    async.waterfall([
        function (callback) {
            var autoshipPaymentDao = daos.createDao('AutoshipPayment', context);
            autoshipPaymentDao.getById(autoshipPaymentId, callback);
        },

        function (autoshipPayment, next) {
            if (!autoshipPayment.creditcard_id) {
                callback(null, null);
                return;
            }

            var creditcardDao = daos.createDao('Creditcard', context);
            creditcardDao.getPaymentTokenIdByCreditcardId(autoshipPayment.creditcard_id, callback);
        }

    ], callback);
}


function getPaymentRequestData(context, order, payment, callback) {
    var data = {
        'user-id' : order.user_id,
        'order-id' : order.id,
        'order-number' : order.number,
        'payment-id' : payment.id,
        'payment-method-id' : payment.payment_method_id,
        'payment-amount' : payment.amount,
        'order-amount' : order.total,
        description : context.companyCode + ' Order',
        'additional-payment-gateway-fields' : null
    };

    async.waterfall([
        function (callback) {
            // using payment token
            if (payment.autoship_payment_id) {
                getPaymentTokenByAutoshipPaymentId(context, payment.autoship_payment_id, function (error, paymentTokenId) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!paymentTokenId) {
                        error = new Error("Can't get payment token.");
                        error.statusCode = 403;
                        callback(error);
                        return;
                    }

                    data['payment-token-id'] = paymentTokenId.toString();
                    callback();
                });
                return;
            }

            // using creditcard info
            data.creditcard = getCreditcardData(payment.creditcard);
            data['billing-address'] = getBillingAddressData(order.billingAddress);

            callback();
        },

        function (callback) {
            OrderDao.getCurrencyOfOrder(context, order, function (error, currency) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!currency) {
                    error = new Error("Can't get currency of order " + order.id);
                    callback(error);
                    return;
                }

                data['currency-code'] = currency.iso_code;
                callback();
            });
        },

        function (callback) {
            var paymentDao = daos.createDao('Payment', context);
            paymentDao.getPaymentMethodOfPayment(payment, callback);
        },

        function (paymentMethod, callback) {
            if (paymentMethod.type === 'Gateway::Ipay') {
                getAdditionalDataOfIPay(context, order, payment, callback);
            } else if (paymentMethod.type === 'Gateway::Verifi') {
                getAdditionalDataOfVerifi(context, order, payment, callback);
            } else if (paymentMethod.type === 'Gateway::Worldpay') {
                getAdditionalDataOfWorldpay(context, order, payment, callback);
	    } else if (paymentMethod.type === 'Gateway::PaymentExpress') {
                getAdditionalDataOfPaymentExpress(context, order, payment, callback);
            } else {
                callback(null, null);
            }
        },

        function (additionalData, callback) {
            data['additional-payment-gateway-fields'] = additionalData;
            callback(null, data);
        }
    ], callback);
}


function sendPaymentRequest(context, requestData, callback) {
    var logger = context.logger,
        paymentConfig = context.config.payment,
        serverAddress = paymentConfig.address,
        clientId = paymentConfig.clientId,
        timeout = paymentConfig.timeout,
        url = serverAddress + '/purchases',
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

    logger.debug('Sending payment request to payment server: %s', serverAddress);
    logger.debug(u.omit(requestData, 'creditcard'));

    stat = statsdHelper.beginStat(context, 'payment_request');

    request(requestOptions, function (error, response, body) {
        var paymentError,
            errorMessage;

        if (error) {
            stat.finishStat('failed');

            airbrakeHelper.notifyError(context, error, {
                component : 'payment_request',
                params : {
                    requestData : u.omit(requestData, 'creditcard')
                }
            });

            callback(error);
            return;
        }

        logger.debug(body);

        if (response.statusCode !== 200) {
            error = body && body.meta && body.meta.error;

            // order was already paid
            if (error && error['error-code'] === 'already_paid') {
                logger.warn('Payment %d was already paid.', requestData['payment-id']);

                callback(null, {
                    'response-code': '',
                    'avs-response': '',
                    'order-id': requestData['order-id'].toString(),
                    'payment-id': requestData['payment-id'].toString(),
                    'payment-amount': requestData['payment-amount']
                });
                return;
            }

            stat.finishStat('failed');

            errorMessage = 'Payment request failed.';
            if (error && error.message) {
                errorMessage += ' ' + error.message;
            }

            paymentError = new Error(errorMessage);
            paymentError.errorCode = 'PaymentFailed';

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

function processPaymentRequest(context, requestData, callback) {
    var logger = context.logger,
        tryCount = 0,
        tryLimit = 3,
        paymentResult,
        lastError;

    async.whilst(function () {
        return tryCount < tryLimit;
    }, function (next) {
        tryCount += 1;
        logger.debug('Trying send payment request... ' + tryCount);
        sendPaymentRequest(context, requestData, function (error, result) {
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
        paymentError.errorCode = error.errorCode || 'PaymentFailed';
        callback(paymentError);
    });
}

function validateCardType(context, creditcard, callback) {
    if (!isValidCardType(creditcard.cc_type)) {
        var error = new Error('Invalid card type.');
        error.errorCode = 'InvalidCardType';

        airbrakeHelper.notifyError(context, error, {
            component : 'paymentMethods.creditcard',
            params : {
                creditcardNumber : creditcard.number
            }
        });
        callback(error);
        return;
    }

    callback();
}

function validateIsInChargebackCreditcards(context, creditcard, callback) {
    var number = creditcard.number.replace(/ /g, ''),
        signature = crypto.createHash('sha512').update(number).digest('hex');

    context.readModels.ChargebackCreditcard.find({
        where : {hash_signature : signature, active : true}
    }).done(function (error, chargebackCreditcard) {
        if (error) {
            callback(error);
            return;
        }

        if (chargebackCreditcard) {
            error = new Error('This creditcard has been used in some chargeback orders, please call Customer Services to pay for the chargeback orders first.');
            error.errorCode = 'InvalidCreditcardInfo';
            error.statusCode = 400;
            callback(error);
        }

        callback();
    });
}


function validateCreditcard(context, creditcard, callback) {
    var logger = context.logger;

    async.waterfall([
        function (callback) {
            logger.debug('Validating card type...');
            validateCardType(context, creditcard, callback);
        },

        function (callback) {
            logger.debug('Checking if creditcard signature is in chargeback creditcards.');
            validateIsInChargebackCreditcards(context, creditcard, callback);
        }
    ], callback);
}


function process(context, order, payment, callback) {
    var logger = context.logger;

    if (payment.autoship_payment_id) {
        logger.debug('Processing payment with token...');
    } else {
        logger.debug('Processing payment with creditcard...');
    }

    async.waterfall([
        function (callback) {
            if (payment.autoship_payment_id) {
                callback();
                return;
            }

            validateCreditcard(context, payment.creditcard, callback);
        },

        function (callback) {
            getPaymentRequestData(context, order, payment, callback);
        },

        function (requestData, callback) {
            processPaymentRequest(context, requestData, callback);
        }
    ], function (error, paymentResult) {
        var paymentState = 'completed',
            updateData;

        if (error) {
            paymentState = 'failed';
        } else {
            updateData = {
                response_code : paymentResult['response-code'],
                avs_response : paymentResult['avs-response']
            };
        }

        PaymentDao.updatePaymentState(context, payment, paymentState, updateData, function () {
            callback(error);
        });
    });
}


exports.process = process;

sidedoor.expose(module, 'privateAPIes', {
    getPaymentRequestData : getPaymentRequestData,
    sendPaymentRequest : sendPaymentRequest
});

/**
 * Payment DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var daos = require('./index');

function Payment(context) {
    DAO.call(this, context);
}

util.inherits(Payment, DAO);


Payment.isProcessing = function (payment) {
    return payment.state === 'processing';
};


Payment.updatePaymentState = function (context, payment, state, updateData, callback) {
    if (payment.state === state) {
        callback();
        return;
    }

    if (state !== 'checkout' &&
            state !== 'pending' &&
            state !== 'completed' &&
            state !== 'processing' &&
            state !== 'failed' &&
            state !== 'void') {
        callback(new Error('Unkown payment state.'));
        return;
    }

    var logger = context.logger,
        fieldsToUpdate = updateData ? ['state', 'response_code', 'avs_response'] : ['state'];

    logger.debug('Update state of payment from `%s` to `%s`.', payment.state, state);
    payment.state = state;
    if (updateData) {
        payment.response_code = updateData.response_code;
        payment.avs_response = updateData.avs_response;
    }
    payment.save(fieldsToUpdate).success(function () {
        callback();
    }).error(callback);
};


Payment.startProcess = function (context, payment, callback) {
    Payment.updatePaymentState(context, payment, 'processing', null, callback);
};


Payment.getPaymentMethodOfPayment = function (context, payment, callback) {
    if (payment.paymentMethod) {
        callback(null, payment.paymentMethod);
        return;
    }

    var paymentMethodDao = daos.createDao('PaymentMethod', context);
    paymentMethodDao.getById(payment.payment_method_id, function (error, paymentMethod) {
        if (error) {
            callback(error);
            return;
        }

        payment.paymentMethod = paymentMethod;
        callback(null, paymentMethod);
    });
};


Payment.getPaymentProcessor = function (context, payment, callback) {
    var logger = context.logger;

    logger.debug("Getting payment processor of payment %d.", payment.id);
    async.waterfall([
        function (callback) {
            logger.debug("Getting payment method.", payment.id);
            Payment.getPaymentMethodOfPayment(context, payment, callback);
        },

        function (paymentMethod, callback) {
            logger.debug("Payment method: %s.", paymentMethod.name);

            var processor;
            if (paymentMethod.is_creditcard) {
                processor = require('../lib/paymentMethods/creditcard');
            } else if (paymentMethod.type === 'PaymentMethod::GiftCard') {
                processor = require('../lib/paymentMethods/giftCard');
            } else if (paymentMethod.type === 'PaymentMethod::Cash') {
                processor = require('../lib/paymentMethods/cash');
            }

            callback(null, processor);
        }
    ], callback);
};


Payment.prototype.getPaymentMethodOfPayment = function (payment, callback) {
    Payment.getPaymentMethodOfPayment(this.context, payment, callback);
};


Payment.prototype.createPayment = function (payment, callback) {
    var context = this.context,
        creditcard;

    payment.state = 'checkout';
    async.waterfall([
        function (callback) {
            var error,
                autoshipPaymentDao,
                creditcardDao = daos.createDao('Creditcard', context);

            if (payment.source_type !== 'Creditcard') {
                callback();
                return;
            }

            if (payment.autoship_payment_id) {
                async.waterfall([
                    function (callback) {
                        autoshipPaymentDao = daos.createDao('AutoshipPayment', context);
                        autoshipPaymentDao.getById(payment.autoship_payment_id, callback);
                    },

                    function (autoshipPayment, callback) {
                        creditcardDao.getById(autoshipPayment.creditcard_id, callback);
                    },

                    function (result, callback) {
                        payment.creditcard = creditcard = result;
                        payment.source_id = creditcard.id;
                        callback();
                    }
                ], callback);
                return;
            }

            if (!payment.creditcard) {
                error = new Error('Creditcard is required.');
                error.errorCode = 'InvalidCreditcard';
                callback(error);
                return;
            }

            creditcardDao.createCreditcard(payment.creditcard, function (error, newCreditcard) {
                if (error) {
                    callback(error);
                    return;
                }
                creditcard = newCreditcard;
                payment.source_id = creditcard.id;
                callback();
            });
        },

        function (callback) {
            context.models.Payment.create(payment).success(function (newPayment) {
                if (creditcard && payment.source_type === 'Creditcard') {
                    newPayment.creditcard = creditcard;
                }
                callback(null, newPayment);
            }).error(callback);
        }
    ], callback);
};


Payment.prototype.processPayment = function (order, payment, callback) {
    var context = this.context,
        logger = context.logger;

    logger.debug('Process payment %d...', payment.id);

    if (Payment.isProcessing(payment)) {
        logger.debug('Payment %d is processing, state: %s.', payment.id, payment.state);
        callback();
        return;
    }

    async.waterfall([
        function (callback) {
            Payment.startProcess(context, payment, callback);
        },

        function (callback) {
            Payment.getPaymentProcessor(context, payment, callback);
        },

        function (paymentProcessor, callback) {
            if (!paymentProcessor) {
                var error = new Error('Unsupported payment method.');
                error.errorCode = 'InvalidPaymentMethod';
                callback(error);
                return;
            }
            paymentProcessor.process(context, order, payment, callback);
        }
    ], callback);
};


Payment.prototype.capturePayment = function (payment, callback) {
    var context = this.context,
        logger = context.logger;

    logger.debug("Capture payment %d...", payment.id);
    async.waterfall([
        function (callback) {
            Payment.updatePaymentState(context, payment, 'completed', null, callback);
        },

        function (callback) {
            callback(null, payment);
        }
    ], callback);
};


Payment.prototype.getPaymentsOfOrder = function (orderId, callback) {
    this.readModels.Payment.findAll({
        where: {order_id : orderId}
    }).success(function (payments) {
        callback(null, payments);
    }).error(callback);
};


Payment.prototype.updateStateOfPayment = function (payment, state, updateData, callback) {
    Payment.updatePaymentState(this.context, payment, state, updateData, callback);
};

module.exports = Payment;

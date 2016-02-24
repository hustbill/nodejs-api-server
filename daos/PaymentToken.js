'use strict';

var u = require('underscore');
var async = require('async');
var request = require('request');
var daos = require('./index');
var DAO = require('./DAO.js');
var util = require('util');
var statsdHelper = require('../lib/statsdHelper');
var airbrakeHelper = require('../lib/airbrakeHelper');

function PaymentToken(context) {
    DAO.call(this, context);
}

util.inherits(PaymentToken, DAO);

module.exports = PaymentToken;


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

function createPaymentToken(options, callback) {
    var context = options.context;
    var logger = context.logger;
    var userId = options.userId;
    var billingAddressId = options.billingAddressId;
    var creditcard = options.creditcard;
    var paymentMethodId = options.paymentMethodId;

    var createPaymentTokenData = {
            'user-id' : userId,
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
            var addressDao = daos.createDao('Address', context);
            addressDao.getAddressById(billingAddressId, callback);
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

function createCreditcardAndToken (options, callback){
    var context  = options.context;
    var paymentMethodId = options.paymentMethodId;
    var creditcard= options.creditcard;
    var userId = options.userId;
    var billingAddressId = options.billingAddressId;
    var creditcardDao = daos.createDao('Creditcard', context);
    var newCreditcard;
    async.waterfall([
        function(callback){
            creditcardDao.findCreditcardByOptions({
                    number : creditcard.number,
                    year : creditcard.year,
                    month : creditcard.month,
                    cvv : creditcard.cvv,
                    user_id : userId
                }, callback);
        },
        function(creditcard2, callback){
            if(creditcard2){
                callback(null, creditcard2);
                return;
            }
            // create creditcard

            creditcardDao.createCreditcard({
                    saveIssueNumber : true,
                    number : creditcard.number,
                    year : creditcard.year,
                    month : creditcard.month,
                    cvv : creditcard.cvv,
                    active : true,
                    user_id : userId
                }, callback);

        },

        function (result, callback) {
            newCreditcard = result;

            // create payment token
            createPaymentToken({
                context: context,
                userId: userId,
                creditcard: newCreditcard,
                billingAddressId: billingAddressId,
                paymentMethodId: paymentMethodId
            }, function (error, paymentTokenId) {
                if (error) {
                    callback(error);
                    return;
                }

                creditcardDao.setTokenIdOfCreditcard(newCreditcard, paymentMethodId, paymentTokenId, callback);
            });
        }
    ], callback);
}

/**
 * find or create token for payment
 * @param  {object}   options  [description]
 *     options:
 *         paymentMethodId:
 *         creditcard:
 *         userId:
 *         billingAddressId:
 *
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
PaymentToken.prototype.findOrCreatePaymentToken = function(options, callback) {
    var context  = this.context;
    var creditcard= options.creditcard;
    var userId = options.userId;
    var creditcardDao = daos.createDao('Creditcard', context);
    

    async.waterfall([
        function(callback){
            creditcardDao.findTokenByOptions({
                    number : creditcard.number,
                    year : creditcard.year,
                    month : creditcard.month,
                    cvv : creditcard.cvv,
                    user_id : userId
                }, callback);
        },
        function(token, callback){
            if(token){
                callback(null, token);
                return;
            }
            options.context = context;
            createCreditcardAndToken(options, callback);

        }
    ], callback);

};


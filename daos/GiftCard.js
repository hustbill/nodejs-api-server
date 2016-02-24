/**
 * GiftCard DAO class.
 */

var util = require('util');
var async = require('async');
var u = require('underscore');
var uuid = require('node-uuid');
var DAO = require('./DAO.js');
var daos = require('./index');
var random = require('../lib/random');
var mailService = require('../lib/mailService');
var utils = require('../lib/utils');

function GiftCard(context) {
    DAO.call(this, context);
}

util.inherits(GiftCard, DAO);


function generateGiftCardCode() {
    return random.text(12, random.seedLetters);
}


function generateGiftCardPin() {
    return random.text(6, random.seedNumbers);
}


function saveMailingAddress(context, userId, addressData, callback) {
    var logger = context.logger,
        userDao = daos.createDao('User', context);

    logger.debug("Saving mailing address...");
    async.waterfall([

        function(callback) {
            userDao.getById(userId, callback);
        },

        function(user, callback) {
            userDao.getShippingAddressOfUser(user, callback);
        },

        function(shippingAddressOfUser, next) {
            var addressDao = daos.createDao('Address', context);

            if (shippingAddressOfUser && addressDao.isAddressEquals(shippingAddressOfUser, addressData)) {
                callback(null, shippingAddressOfUser);
                return;
            }

            addressDao.createShippingAddress(addressData, next);
        }
    ], callback);
}


/*
 * Create a gift card record in database
 */
function createGiftCard(context, options, callback) {
    var giftCard = {
            active: false,
            code: generateGiftCardCode(),
            pin: generateGiftCardPin(),
            user_id: options.userId,
            variant_id: options.variantId,
            description: options.description,
            total: options.amount,
            balance: options.amount,
            mailing_address_id: null
        },
        emailInfo = options.emailInfo,
        mailingInfo = options.mailingInfo;

    if (emailInfo) {
        giftCard.email_message = emailInfo.message;
        giftCard.name_to = emailInfo.nameTo;
        giftCard.name_from = emailInfo.nameFrom;
        giftCard.recipient_email = emailInfo.recipientEmail;
    }

    if (mailingInfo) {
        giftCard.mailing_message = mailingInfo.message;
    }

    async.waterfall([

        function(callback) {
            if (!mailingInfo) {
                callback();
                return;
            }

            saveMailingAddress(context, options.userId, mailingInfo, function(error, address) {
                if (error) {
                    callback(error);
                    return;
                }

                giftCard.mailing_address_id = address.id;
                callback();
                return;
            });
        },

        function(callback) {
            context.models.GiftCard.create(giftCard).done(callback);
        }
    ], callback);
}


function getGiftCardsByOrderId(context, orderId, callback) {
    context.readModels.GiftCard.findAll({
        where: {
            order_id: orderId
        }
    }).done(callback);
}


function sendGiftCardEmail(context, giftCard, variant, callback) {
    if (!callback) {
        callback = function() {};
    }

    if (!giftCard.active) {
        callback();
        return;
    }
    var config = context.config;
    var logger = context.logger,
        mailData = {};

    logger.debug("Sending gift card email of gift card %d", giftCard.id);

    async.waterfall([

        function(callback) {
            logger.debug("Preparing mail data...");

            mailData['email-subject'] = 'Gift Card';
            mailData.number = giftCard.code;
            mailData.pin = giftCard.pin;
            mailData.amount = giftCard.total;
            mailData.to = giftCard.name_to;
            mailData.from = giftCard.name_from;
            mailData.message = giftCard.email_message;
            mailData['recipient-email'] = giftCard.recipient_email;
            mailData['currency-symbol'] = '$';

            if (config && config.application && config.application.giftcardCurrencySymbol) {
                mailData['currency-symbol'] = config.application.giftcardCurrencySymbol;
            }

            callback();
        },

        // function (callback) {
        //     var currencyDao = daos.createDao('Currency', context);
        //     currencyDao.getCurrencyById(order.currency_id, function (error, currency) {
        //         if (error) {
        //             callback(error);
        //             return;
        //         }

        //         if (!currency) {
        //             error = new Error("Can't get currency of %d", order.currency_id);
        //             callback(error);
        //             return;
        //         }

        //         mailData['currency-symbol'] = currency.symbol;
        //         callback();
        //     });
        // },

        // function (callback) {
        //     var variant = order.lineItems[0].variant;
        //     console.log("variant.images: " + require('util').inspect(variant.images));
        //     if (variant.images && variant.images.length) {
        //         mailData['background-image'] = variant.images[0].replace('large_', 'email_');
        //     }
        //     callback();
        // },

        function(callback) {
            logger.debug("variant:%j", variant);
            if (variant) {
                logger.debug("variant.images: " + require('util').inspect(variant.images));
                if (variant.images && variant.images.length) {
                    mailData['background-image'] = variant.images[0].replace('large_', 'email_');
                }
            }else{
                mailData['background-image'] = "";
            }

            callback();
        },

        function(callback) {
            mailService.sendMail(context, 'giftcards', mailData, function(error) {
                if (error) {
                    logger.error("Failed to send gift card email: %s", error.message);
                }
                callback();
            });
        }
    ], callback);
}

/**
 * Get gift card by code and pin
 * @param code {String} code of the gift card
 * @param pin {String} pin of the gift card
 * @param callback {Function} Callback function.
 */
GiftCard.prototype.getGiftCardByCodeAndPin = function(code, pin, callback) {
    var context = this.context;

    async.waterfall([

        function(callback) {
            context.readModels.GiftCard.find({
                where: {
                    code: code
                }
            }).done(callback);
        },

        function(giftCard, callback) {
            if (!giftCard) {
                callback(null, null);
                return;
            }

            if (giftCard.pin !== pin) {
                var error = new Error("Wrong pin.");
                error.errorCode = 'InvalidGiftCardPin';
                error.statusCode = 400;
                callback(error);
                return;
            }

            callback(null, giftCard);
        }
    ], callback);
};


function validateGiftCards(giftCards, callback) {
    var giftCard,
        i,
        emailInfo,
        error;

    if (!giftCards || !giftCards.length) {
        error = new Error('Gift cards are required.');
        error.errorCode = 'InvalidGiftCard';
        error.statusCode = 400;
        callback(error);
        return;
    }

    for (i = 0; i < giftCards.length; i += 1) {
        giftCard = giftCards[i];
        emailInfo = giftCard.emailInfo;

        if (emailInfo) {
            if (!utils.isValidEmail(emailInfo.recipientEmail)) {
                error = new Error('Invalid recipient email.');
                error.errorCode = 'InvalidRecipientEmail';
                error.statusCode = 400;
                callback(error);
                return;
            }
        }
    }

    callback();
}

/*
 * Purchase gift cards
 *  options = {
 *      userId : <Integer>,
 *      giftCards : <Array>,
 *      creditcard : <Object>,
 *      eventCode : <String>
 *  }
 */
GiftCard.prototype.purchaseGiftCards = function(options, callback) {
    var context = this.context,
        logger = context.logger,
        userDao = daos.createDao('User', context),
        orderDao = daos.createDao('Order', context),
        user,
        giftCards = [],
        giftCard,
        order;

    logger.debug("Start purchasing gift card...");
    async.waterfall([
        function (callback) {
            validateGiftCards(options.giftCards, callback);
        },

        function (callback) {
            userDao.getById(options.userId, function(error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                user = result;
                callback();
            });
        },

        function (callback) {
            userDao.getRolesOfUser(user, function(error, roles) {
                if (!roles.length) {
                    error = new Error("User doesn't belong to any roles.");
                    error.errorCode = 'NoPermissionToGetVariantDetail';
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                options.roleId = roles[0].id;
                callback();
            });
        },

        function (callback) {
            // create giftcards
            async.forEachSeries(options.giftCards, function (purchaseGiftCardOptions, callback) {
                async.waterfall([
                    function (callback) {
                        var variantDao = daos.createDao('Variant', context),
                            getVariantDetailOptions = {
                                user: user,
                                variantId: purchaseGiftCardOptions.variantId,
                                roleId: options.roleId,
                                catalogCode: 'GC'
                            };

                        variantDao.getVariantDetailForUser(getVariantDetailOptions, function(error, variant) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            if (!variant) {
                                error = new Error('Variant with id ' + options.variantId + ' was not found.');
                                error.errorCode = 'InvalidVariantId';
                                error.statusCode = 400;
                                callback(error);
                                return;
                            }

                            purchaseGiftCardOptions.giftCardVariant = variant;
                            purchaseGiftCardOptions.amount = variant.price;
                            callback();
                        });
                    },

                    function (callback) {
                        if (!purchaseGiftCardOptions.quantity) {
                            purchaseGiftCardOptions.quantity = 1;
                        }

                        logger.debug("Creating gift cards...");

                        async.timesSeries(purchaseGiftCardOptions.quantity, function (n, callback) {
                            var createGiftCardOptions = {
                                    userId : options.userId,
                                    variantId : purchaseGiftCardOptions.variantId,
                                    amount : purchaseGiftCardOptions.amount,
                                    emailInfo : purchaseGiftCardOptions.emailInfo,
                                    mailingInfo : purchaseGiftCardOptions.mailingInfo
                                };
                            createGiftCard(context, createGiftCardOptions, function(error, result) {
                                if (error) {
                                    callback(error);
                                    return;
                                }

                                result.variant = purchaseGiftCardOptions.giftCardVariant;
                                giftCards.push(result);
                                callback();
                            });
                        }, function (error) {
                            callback(error);
                        });
                    }
                ], callback);
            }, function (error) {
                callback(error);
            });
        },

        function (callback) {
            userDao.getCountryOfUser(user, function(error, country) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!country) {
                    error = new Error("Can't get country of user.");
                    callback(error);
                    return;
                }

                orderDao.getAvailablePaymentMethodsByCountryId(country.id, function(error, availablePaymentMethods) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!availablePaymentMethods || !availablePaymentMethods.length) {
                        error = new Error("Can't get available payment method.");
                        callback(error);
                        return;
                    }

                    options.paymentMethodId = availablePaymentMethods[0].id;
                    callback();
                });
            });
        },

        function (callback) {
            var createOrderOptions = {
                userId: options.userId,
                lineItems: [],
                paymentMethodId: options.paymentMethodId,
                creditcard: options.creditcard
            };

            options.giftCards.forEach(function (purchaseGiftCardOptions) {
                createOrderOptions.lineItems.push({
                    variantId: purchaseGiftCardOptions.variantId,
                    quantity: purchaseGiftCardOptions.quantity,
                    catalogCode: 'GC'
                });
            });

            if (options.eventCode){
                createOrderOptions.eventCode = options.eventCode;
            }
            
            logger.debug("Creating gift card order...");
            orderDao.createOrder(createOrderOptions, callback);
        },

        function (result, callback) {
            order = result;

            async.forEachSeries(giftCards, function (giftCard, callback) {
                giftCard.order = order;

                // set `order_id` of gift card after order was created.
                // `active` field of gift card need to be set because `order_id` of gift card was not set when creating order 
                giftCard.order_id = order.id;
                if (order.state === 'complete' && (order.payment_state === 'paid' || order.payment_state === 'credit_owed')) {
                    giftCard.active = true;
                } else {
                    giftCard.active = false;
                }

                giftCard.save(['order_id', 'active']).done(function(error) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    sendGiftCardEmail(context, giftCard, giftCard.variant);
                    callback();
                });
            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, order);
            });
        }
    ], callback);
};


/*
 *  options = {
 *      orderId : <Integer>,
 *      creditcard : <Object>
 *  }
 */
GiftCard.prototype.payGiftCardOrder = function(options, callback) {
    var context = this.context,
        logger = context.logger,
        userDao = daos.createDao('User', context),
        orderDao = daos.createDao('Order', context),
        user,
        giftCard;

    async.waterfall([

        function(callback) {
            getGiftCardsByOrderId(context, options.orderId, function(error, giftCards) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!giftCards || !giftCards.length) {
                    error = new Error("Order " + options.orderId + " is not a gift card order.");
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                giftCard = giftCards[0];

                if (giftCard.user_id !== options.userId) {
                    error = new Error("Can't pay other's order.");
                    error.statusCode = 403;
                    callback(error);
                    return;
                }
                callback();
            });
        },

        function(callback) {
            userDao.getById(options.userId, function(error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                user = result;
                callback();
            });
        },

        function(callback) {
            userDao.getCountryOfUser(user, function(error, country) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!country) {
                    error = new Error("Can't get country of user.");
                    callback(error);
                    return;
                }

                orderDao.getAvailablePaymentMethodsByCountryId(country.id, function(error, availablePaymentMethods) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!availablePaymentMethods || !availablePaymentMethods.length) {
                        error = new Error("Can't get available payment method.");
                        callback(error);
                        return;
                    }

                    options.paymentMethodId = availablePaymentMethods[0].id;
                    callback();
                });
            });
        },

        function(callback) {
            var payOrderOptions = {
                orderId : giftCard.order_id,
                paymentMethodId: options.paymentMethodId,
                creditcard: options.creditcard
            };

            orderDao.payOrderById(payOrderOptions, callback);
        }
    ], callback);
};


GiftCard.prototype.activateGiftCardsByOrder = function(order, callback) {
    var context = this.context,
        logger = context.logger,
        orderId = order.id,
        giftCards;

    logger.debug("Activating gift cards of order %d", orderId);

    async.waterfall([

        function(next) {
            logger.debug("Getting gift cards of order %d", orderId);
            getGiftCardsByOrderId(context, orderId, function(error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                giftCards = result;

                if (!giftCards || !giftCards.length) {
                    callback();
                    return;
                }

                next();
            });
        },

        function (callback) {
            async.forEachSeries(giftCards, function (giftCard, callback) {
                async.waterfall([
                    function(callback) {
                        var queryDatabaseOptions = {
                            useWriteDatabase: true,
                            sqlStmt: 'update gift_cards set active=true where id=$1',
                            sqlParams: [giftCard.id]
                        };

                        DAO.queryDatabase(context, queryDatabaseOptions, function(error) {
                            callback(error);
                        });
                    },

                    function(callback) {
                        giftCard.active = true;
                        sendGiftCardEmail(context, giftCard, order);
                        callback();
                    }
                ], callback);
            }, function (error) {
                callback(error);
            });
        }
    ], callback);
};


/*
 *  options = {
 *      userId : <Integer>
 *  }
 */
GiftCard.prototype.getGiftCardsByUserId = function(options, callback) {
    var context = this.context;

    context.readModels.GiftCard.findAll({
        where: {
            user_id: options.userId,
            active: true
        },
        order: "id desc"
    }).done(callback);
};


GiftCard.prototype.sendGiftCardEmailByCode = function(giftCardCode, callback) {
    var context = this.context,
        userId = context.user.userId,
        giftCard,
        order,
        variant,
        error;

    async.waterfall([

        function(callback) {
            context.readModels.GiftCard.find({
                where: {
                    code: giftCardCode
                }
            }).done(callback);
        },

        function(result, callback) {
            giftCard = result;

            if (!giftCard) {
                error = new Error("Gift card with code '" + giftCardCode + "' does not exist.");
                error.errorCode = 'InvalidGiftCardCode';
                error.statusCode = 404;
                callback(error);
                return;
            }

            if (!giftCard.active) {
                error = new Error("Gift card with code '" + giftCardCode + "' is not active.");
                error.errorCode = 'GiftCardInactive';
                error.statusCode = 403;
                callback(error);
                return;
            }

            callback();
        },

        // function (next) {
        //     // send email only when giftcard is active.
        //     //  
        //     if (!giftCard.active || !giftCard.order_id) {
        //         callback();
        //         return;
        //     }

        //     next();
        // },

        // function (callback) {
        //     var orderDao = daos.createDao('Order', context);
        //     orderDao.getOrderInfo(giftCard.order_id, callback);
        // },

        function(callback) {
            var variantDao = daos.createDao('Variant', context);

            variantDao.getVariantsWithOptionsByIds({
                variantIds: [giftCard.variant_id],
                includeImages : true
            }, callback);
        },

        function(result, callback) {
            variant = u.isArray(result)?result[0]:{};

            sendGiftCardEmail(context, giftCard, variant);
            callback(null, giftCard);
        }
    ], callback);
};


/*
 *  options = {
 *      code : <String>
 *      pin : <String>
 *      orderId : <Integer>
 *      amount : <Float>
 *  }
 */
GiftCard.prototype.payByGiftcard = function(options, callback) {
    var self = this,
        context = this.context,
        amount = options.amount,
        orderId = options.orderId,
        error;

    if (!(amount > 0)) {
        error = new Error("Amount must be great than 0.");
        error.errorCode = 'InvalidAmount';
        error.statusCode = 400;
        callback(error);
        return;
    }

    async.waterfall([

        function(callback) {
            context.models.GiftCard.find({
                where: {
                    code: options.code
                }
            }).done(callback);
        },

        function(result, callback) {
            giftCard = result;

            if (!giftCard) {
                error = new Error("Gift card does not exist.");
                error.errorCode = 'InvalidGiftCardCode';
                error.statusCode = 400;
                callback(error);
                return;
            }

            if (giftCard.pin !== options.pin) {
                var error = new Error("Wrong pin.");
                error.errorCode = 'InvalidGiftCardPin';
                error.statusCode = 400;
                callback(error);
                return;
            }

            if (!giftCard.active) {
                error = new Error('giftCard is not active');
                error.errorCode = 'GiftCardIsNotActive';
                error.statusCode = 400;
                callback(error);
                return;
            }

            if (giftCard.balance < amount) {
                error = new Error('Lack of balance');
                error.errorCode = 'LackOfBalance';
                error.statusCode = 400;
                callback(error);
                return;
            }

            // create gift card payment record
            var giftCardPaymentDao = daos.createDao('GiftCardPayment', context),
                giftCardPayment = {
                    gift_card_id: giftCard.id,
                    order_id: orderId,
                    amount: amount
                };
            giftCardPaymentDao.createGiftCardPayment(giftCardPayment, callback);
        },

        function(giftCardPayment, callback) {
            giftCard.balance = giftCard.balance - amount;
            giftCard.save(['balance']).done(callback);
        }
    ], callback);
};


module.exports = GiftCard;

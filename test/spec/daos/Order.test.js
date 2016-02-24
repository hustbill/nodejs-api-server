/*global describe, it */
/*jshint expr:true */

var rewire = require('rewire');
var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');
var util = require('util');
var DAO = require('../../../daos/DAO');
var sidedoor = require('sidedoor');
var couponHelper = require('../../helpers/couponHelper');
var daos = require('../../../daos/');

var sutPath = '../../../daos/Order.js';
var OrderDao = rewire(sutPath);
var privateAPIes = sidedoor.get(sutPath, 'privateAPIes');

var PaymentDao = require('../../../daos/Payment');
var mapper = require('../../../mapper');


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        redis : true,
        user : true
    }, callback);
}


function getContextOfCA(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        redis : true,
        extend : {
            user : {
                distributorId : testUtil.getTestDistributorIdOfCA(),
                userId : testUtil.getTestUserIdOfCA(),
                login : testUtil.getTestLoginNameOfCA()
            }
        }
    }, callback);
}


function copyAddress(address) {
    var result = {},
        properties = ['firstname', 'lastname', 'address1', 'address2', 'city', 'country_id', 'state_id', 'zipcode'];


    properties.forEach(function (key) {
        result[key] = address[key];
    });

    return result;
}


function mockupCreditcardPaymentMethodAlwaysSuccess() {
    mockery.enable();
    mockery.warnOnReplace(false);
    mockery.warnOnUnregistered(false);

    mockery.registerMock('../../../lib/paymentMethods/creditcard', {
        process : function (context, order, payment, callback) {
            var paymentState = 'completed',
                updateData = {
                    response_code : '',
                    avs_response : ''
                };

            PaymentDao.updatePaymentState(context, payment, paymentState, updateData, function () {
                callback(null);
            });
        }
    });
}


function createOrderOfUS(context, options, callback) {
    var items = [
            {variantId : 24, quantity : 1, catalogCode : 'SP'},
            {variantId : 34, quantity : 2, catalogCode : 'SP'}
        ],
        address = {
            firstname : 'Mike',
            lastname : 'Jim',
            address1 : '111 Autumn Drive',
            city : 'LANCASTER',
            country_id : 1214,
            state_id : 10049,
            zipcode : '43130'
        },
        createOrderOptions = {
            userId : context.user.userId,
            lineItems : items,
            shippingAddress : address,
            billingAddress : address,
            shippingMethodId : 4,
            paymentMethodId : 3003,
            creditcard : testUtil.getTestCreditcardInfoOfNormal(),
            doNotPay : options.doNotPay
        },
        orderDao = new OrderDao(context);

    orderDao.createOrder(createOrderOptions, callback);
}


function createOrderOfCA(context, options, callback) {
    var items = [
            {variantId : 48, quantity : 1}
        ],
        createOrderOptions = {
            lineItems : items,
            shippingMethodId : 1,
            paymentMethodId : 3120,
            creditcard : testUtil.getTestCreditcardInfoOfNormal(),
            doNotPay : options.doNotPay
        },
        user = null,
        orderDao = new OrderDao(context);

    async.waterfall([
        function (callback) {
            context.models.User.find(context.user.userId).done(callback);
        },

        function (result, callback) {
            user = result;
            context.models.Address.find(user.ship_address_id).done(function (error, address) {
                if (error) {
                    callback(error);
                    return;
                }

                createOrderOptions.shippingAddress = address;
                callback();
            });
        },

        function (callback) {
            context.models.Address.find(user.bill_address_id).done(function (error, address) {
                if (error) {
                    callback(error);
                    return;
                }

                createOrderOptions.billingAddress = address;
                callback();
            });
        },

        function (callback) {
            orderDao.createOrder(createOrderOptions, callback);
        }
    ], callback);
}


describe('daos/Order', function () {
    describe('-updateNextRenewalDateIfNecessary()', function () {
        it('should update next_renewal_date of distributor if bought a renewal product', function (done) {
            var context,
                now = new Date(),
                prevRenewalDate = new Date(2013, 11, 1),
                nextRenewalDateExpected =  new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
                order = {},
                items = [//product_id=143
                    {variantId : 136, quantity : 1, catalogCode: 'RG'}
                ],
                updated = false;

            mockery.enable();
            mockery.warnOnReplace(false);
            mockery.warnOnUnregistered(false);

            mockery.registerMock('../../../daos/Distributor', function () {
                this.updateNextRenewalDateOfDistributor = function (options, callback) {
                    expect(options.nextRenewalDate.getTime()).to.equal(nextRenewalDateExpected.getTime());
                    // console.log("---------->", JSON.stringify(options));
                    updated = true;
                    callback();
                };
            });

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;
                    order.user = {
                        id : context.user.userId,
                        distributor : context.models.Distributor.build({
                            id : context.user.distributorId,
                            next_renewal_date : prevRenewalDate
                        })
                    };

                    privateAPIes.getLineItems(context, order.user, items, callback);
                },

                function (lineItems, callback) {
                    order.lineItems = lineItems;

                    privateAPIes.updateNextRenewalDateIfNecessary(context, order, function (error) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        expect(updated).to.equal(true);
                        callback();
                    });
                }
            ], function (error) {
                mockery.deregisterAll();
                mockery.disable();

                done(error);
            });
        });


        // it('should update next_renewal_date of distributor if didn\'t buy any renewal product', function (done) {
        //     var context,
        //         now = new Date(),
        //         today = new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        //         nextRenewalDateExpected = new Date(2014, 11, 31),
        //         items = [
        //             {variantId : 12, quantity : 1}
        //         ],
        //         order = {};

        //     mockery.enable();
        //     mockery.warnOnReplace(false);
        //     mockery.warnOnUnregistered(false);

        //     mockery.registerMock('../../../daos/Distributor', function () {
        //         this.updateNextRenewalDateOfDistributor = function (options, callback) {
        //             console.log("2------->", JSON.stringify(options));
        //             callback(new Error('should not call updateNextRenewalDateOfDistributor'));
        //         };
        //     });

        //     async.waterfall([
        //         getContext,

        //         function (result, callback) {
        //             context = result;
        //             order.user = {
        //                 id : context.user.userId,
        //                 distributor : context.models.Distributor.build({
        //                     id : context.user.distributorId,
        //                     next_renewal_date : today
        //                 })
        //             };

        //             privateAPIes.getLineItems(context, order.user, items, callback);
        //         },

        //         function (lineItems, callback) {
        //             order.lineItems = lineItems;

        //             privateAPIes.updateNextRenewalDateIfNecessary(context, order, callback);
        //         }
        //     ], function (error) {
        //         mockery.deregisterAll();
        //         mockery.disable();

        //         done(error);
        //     });
        // });


        // it('should not update next_renewal_date if didn\'t buy any renewal product', function (done) {
        //     var context,
        //         now = new Date(),
        //         yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
        //         nextRenewalDateExpected = new Date(2014, 11, 31),
        //         order = {},
        //         items = [
        //             {variantId : 2, quantity : 1},
        //             {variantId : 3, quantity : 2},
        //             {variantId : 4, quantity : 3}
        //         ];

        //     mockery.enable();
        //     mockery.warnOnReplace(false);
        //     mockery.warnOnUnregistered(false);

        //     mockery.registerMock('../../../daos/Distributor', function () {
        //         this.updateNextRenewalDateOfDistributor = function (distributor, nextRenewalDate, callback) {
        //             callback(new Error('should not call updateNextRenewalDateOfDistributor'));
        //         };
        //     });

        //     async.waterfall([
        //         getContext,

        //         function (result, callback) {
        //             context = result;
        //             order.user = {
        //                 id : context.user.userId,
        //                 distributor : context.models.Distributor.build({
        //                     id : context.user.distributorId,
        //                     next_renewal_date : yesterday
        //                 })
        //             };

        //             privateAPIes.getLineItems(context, order.user, items, callback);
        //         },

        //         function (lineItems, callback) {
        //             order.lineItems = lineItems;

        //             privateAPIes.updateNextRenewalDateIfNecessary(context, order, callback);
        //         }
        //     ], function (error) {
        //         mockery.deregisterAll();
        //         mockery.disable();

        //         done(error);
        //     });
        // });
    });

    describe('-completeDistributorRegistration()', function () {
        it('modify complete Distributor Registration', function (done) {
            var context,
                now = new Date(),
                prevRenewalDate = new Date(2013, 11, 1),
                nextRenewalDateExpected =  new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
                order = {},
                items = [
                    {variantId : 136, quantity : 1, catalogCode: 'RG'}, //product_id=143
                    {variantId : 137, quantity : 1, catalogCode: 'RG'} //product_id=144
                ],
                updated = false;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;
                    order.user = {
                        id : context.user.userId,
                        distributor : context.models.Distributor.build({
                            id : context.user.distributorId,
                            next_renewal_date : prevRenewalDate
                        })
                    };
                    order.user_id = context.user.userId;

                    privateAPIes.getLineItems(context, order.user, items, callback);
                },

                function (lineItems, callback) {
                    order.lineItems = lineItems;
                    var userDao = daos.createDao('User', context);
                    context.companyCode = 'MMD';
                    userDao.getUserById(context.user.userId, callback);
                },

                function (user, callback) {
                    order.user = user;
                    privateAPIes.completeDistributorRegistration(context, order, function (error) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        expect(updated).to.equal(false);
                        callback();
                    });
                }
            ], function (error) {
                done(error);
            });

        });
    });

    // describe('-getZoneIdsOfAddress()', function () {
    //     it('should callback zone ids of given address', function (done) {
    //         var address = {
    //                 country_id : 1214,
    //                 state_id : 10048
    //             },
    //             zoneIdsExpected = [10048, 29, 2];

    //         async.waterfall([
    //             getContext,

    //             function (context, callback) {
    //                 privateAPIes.getZoneIdsOfAddress(context, address, callback);
    //             },

    //             function (zoneIds, callback) {
    //                 expect(zoneIds).to.be.ok;
    //                 expect(zoneIds.sort()).to.eql(zoneIdsExpected.sort());

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('-getAvailableShippingMethodsOfOrder()', function () {
    //     it('should work', function (done) {
    //         var order = {
    //                 ship_address_id : testUtil.getTestAddressIdOfUnitedStates()
    //             },
    //             shippingMethodsExpected = [
    //                 {
    //                     id : 4,
    //                     name : 'US Ground'
    //                 }
    //             ];

    //         async.waterfall([
    //             getContext,

    //             function (context, callback) {
    //                 privateAPIes.getAvailableShippingMethodsOfOrder(context, order, callback);
    //             },

    //             function (shippingMethods, callback) {
    //                 expect(shippingMethods).to.be.ok;
    //                 expect(shippingMethods.map(function (item) {
    //                     return {
    //                         id : item.id,
    //                         name : item.name
    //                     };
    //                 })).to.eql(shippingMethodsExpected);

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('-isShippingMethodAvailableToOrder()', function () {
    //     it('should callback true if shipping method is available to order', function (done) {
    //         var context,
    //             order = {
    //                 ship_address_id : testUtil.getTestAddressIdOfUnitedStates()
    //             },
    //             shippingMethodId = 4;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 var ShippingMethodDao = require('../../../daos/ShippingMethod'),
    //                     shippingMethodDao = new ShippingMethodDao(context);
    //                 shippingMethodDao.getShippingMethodById(shippingMethodId, callback);
    //             },

    //             function (shippingMethod, callback) {
    //                 privateAPIes.isShippingMethodAvailableToOrder(context, order, shippingMethod, callback);
    //             },

    //             function (isAvailable, callback) {
    //                 expect(isAvailable).to.be.true;

    //                 callback();
    //             }
    //         ], done);
    //     });


    //     it('should callback false if shipping method is available to order', function (done) {
    //         var order = {
    //                 ship_address_id : testUtil.getTestAddressIdOfUnitedStates()
    //             },
    //             shippingMethodId = 1;

    //         async.waterfall([
    //             getContext,

    //             function (context, callback) {
    //                 privateAPIes.isShippingMethodAvailableToOrder(context, order, shippingMethodId, callback);
    //             },

    //             function (isAvailable, callback) {
    //                 expect(isAvailable).to.be.false;

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('-getLineItems()', function () {
    //     it('should callback line items with price and line_no', function (done) {
    //         var user = {},
    //             items = [
    //                 {variantId : 2, quantity : 1},
    //                 {variantId : 3, quantity : 2},
    //                 {variantId : 4, quantity : 3}
    //             ],
    //             lineItemsExpected = [
    //                 {
    //                     variant_id: 2,
    //                     price: 199,
    //                     retail_price: 199,
    //                     quantity: 1,
    //                     line_no: 10,
    //                     is_autoship: false
    //                 },
    //                 {
    //                     variant_id: 3,
    //                     price: 299,
    //                     retail_price: 299,
    //                     quantity: 2,
    //                     line_no: 20,
    //                     is_autoship: false
    //                 },
    //                 {
    //                     variant_id: 4,
    //                     price: 499,
    //                     retail_price: 499,
    //                     quantity: 3,
    //                     line_no: 30,
    //                     is_autoship: false
    //                 }
    //             ];

    //         async.waterfall([
    //             getContext,

    //             function (context, callback) {
    //                 privateAPIes.getLineItems(context, user, items, callback);
    //             },

    //             function (lineItems, callback) {
    //                 expect(lineItems).to.be.ok;

    //                 expect(lineItems.map(function (item) {
    //                     return {
    //                         variant_id : item.variant_id,
    //                         price : item.price,
    //                         retail_price : item.retail_price,
    //                         quantity : item.quantity,
    //                         line_no : item.line_no,
    //                         is_autoship : item.is_autoship
    //                     };
    //                 })).to.eql(lineItemsExpected);

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('-validateLineItemsForSystemKit()', function () {
    //     it('should pass', function (done) {
    //         var context,
    //             now = new Date(),
    //             nextRenewalDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5),
    //             user = {
    //                 distributor : {
    //                     next_renewal_date : nextRenewalDate
    //                 }
    //             },
    //             items = [
    //                 {variantId : 2, quantity : 1},
    //                 {variantId : 3, quantity : 2},
    //                 {variantId : 4, quantity : 3}
    //             ];

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 privateAPIes.getLineItems(context, user, items, callback);
    //             },

    //             function (lineItems, callback) {
    //                 user.id = context.user.userId;
    //                 privateAPIes.validateLineItemsForSystemKit(context, user, lineItems, callback);
    //             }
    //         ], done);
    //     });


    //     it('should not fail if user.next_renewal_date is not past and line items contain renewal products', function (done) {
    //         var context,
    //             now = new Date(),
    //             nextRenewalDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5),
    //             user = {
    //                 distributor : {
    //                     next_renewal_date : nextRenewalDate
    //                 }
    //             },
    //             items = [
    //                 {variantId : 68, quantity : 1}
    //             ];

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 privateAPIes.getLineItems(context, user, items, callback);
    //             },

    //             function (lineItems, callback) {
    //                 user.id = context.user.userId;
    //                 privateAPIes.validateLineItemsForSystemKit(context, user, lineItems, callback);
    //             }
    //         ], done);
    //     });


    //     it('should fail if user.next_renewal_date is past and line items not contain renewal products', function (done) {
    //         var context,
    //             now = new Date(),
    //             nextRenewalDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4),
    //             user = {
    //                 distributor : {
    //                     next_renewal_date : nextRenewalDate
    //                 }
    //             },
    //             items = [
    //                 {variantId : 2, quantity : 1},
    //                 {variantId : 3, quantity : 2},
    //                 {variantId : 4, quantity : 3}
    //             ];

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 privateAPIes.getLineItems(context, user, items, callback);
    //             },

    //             function (lineItems, callback) {
    //                 user.id = context.user.userId;
    //                 privateAPIes.validateLineItemsForSystemKit(context, user, lineItems, function (error) {
    //                     expect(error).to.be.instanceof(Error);
    //                     expect(error.errorCode).to.equal('InvalidLineItems');
    //                     expect(error.statusCode).to.equal(400);

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });


    //     it('should pass if user.next_renewal_date is past but line items contain more than one renewal products', function (done) {
    //         var context,
    //             now = new Date(),
    //             nextRenewalDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4),
    //             user = {
    //                 distributor : {
    //                     next_renewal_date : nextRenewalDate
    //                 }
    //             },
    //             items = [
    //                 {variantId : 68, quantity : 2}
    //             ];

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 privateAPIes.getLineItems(context, user, items, callback);
    //             },

    //             function (lineItems, callback) {
    //                 user.id = context.user.userId;
    //                 privateAPIes.validateLineItemsForSystemKit(context, user, lineItems, function (error) {
    //                     expect(error).to.be.instanceof(Error);
    //                     expect(error.errorCode).to.equal('InvalidLineItems');
    //                     expect(error.statusCode).to.equal(400);

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });


    //     it('should pass if user.next_renewal_date is not past but line items contain more than one renewal products', function (done) {
    //         var context,
    //             now = new Date(),
    //             nextRenewalDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5),
    //             user = {
    //                 distributor : {
    //                     next_renewal_date : nextRenewalDate
    //                 }
    //             },
    //             items = [
    //                 {variantId : 68, quantity : 2}
    //             ];

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 privateAPIes.getLineItems(context, user, items, callback);
    //             },

    //             function (lineItems, callback) {
    //                 user.id = context.user.userId;
    //                 privateAPIes.validateLineItemsForSystemKit(context, user, lineItems, function (error) {
    //                     expect(error).to.be.instanceof(Error);
    //                     expect(error.errorCode).to.equal('InvalidLineItems');
    //                     expect(error.statusCode).to.equal(400);

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });
    // });


    // describe('-validateLineItemsForPromotional()', function () {
    //     it('should pass if user did not buy any promotional product', function (done) {
    //         var context,
    //             user = {},
    //             items = [
    //                 {variantId : 2, quantity : 1},
    //                 {variantId : 3, quantity : 2},
    //                 {variantId : 4, quantity : 3}
    //             ];

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 privateAPIes.getLineItems(context, user, items, callback);
    //             },

    //             function (lineItems, callback) {
    //                 user.id = context.user.userId;
    //                 privateAPIes.validateLineItemsForPromotional(context, user, lineItems, callback);
    //             }
    //         ], done);
    //     });


    //     it('should fail if user try to buy any promotional product that has bought', function (done) {
    //         var context,
    //             user = {},
    //             items = [
    //                 {variantId : 2, quantity : 1},
    //                 {variantId : 3, quantity : 2},
    //                 {variantId : 10, quantity : 3}
    //             ];

    //         mockery.enable();
    //         mockery.warnOnReplace(false);
    //         mockery.warnOnUnregistered(false);

    //         mockery.registerMock('../../../daos/User', function () {
    //             this.getBoughtVariantIdsOfUser = function (user, callback) {
    //                 callback(null, [2, 10]);
    //             };
    //         });

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 privateAPIes.getLineItems(context, user, items, callback);
    //             },

    //             function (lineItems, callback) {
    //                 user.id = context.user.userId;
    //                 privateAPIes.validateLineItemsForPromotional(context, user, lineItems, function (error) {
    //                     expect(error).to.be.instanceof(Error);
    //                     expect(error.errorCode).to.equal('InvalidLineItems');
    //                     expect(error.statusCode).to.equal(400);

    //                     callback();
    //                 });
    //             }
    //         ], function (error) {
    //             mockery.deregisterAll();
    //             mockery.disable();

    //             done(error);
    //         });
    //     });


    //     it('should pass if try to buy a promotional product that has never bought', function (done) {
    //         var context,
    //             user = {},
    //             items = [
    //                 {variantId : 2, quantity : 1},
    //                 {variantId : 3, quantity : 2},
    //                 {variantId : 10, quantity : 1}
    //             ];

    //         mockery.enable();
    //         mockery.warnOnReplace(false);
    //         mockery.warnOnUnregistered(false);

    //         mockery.registerMock('../../../daos/User', function () {
    //             this.getBoughtVariantIdsOfUser = function (user, callback) {
    //                 callback(null, [2, 3]);
    //             };
    //         });

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 privateAPIes.getLineItems(context, user, items, callback);
    //             },

    //             function (lineItems, callback) {
    //                 user.id = context.user.userId;
    //                 privateAPIes.validateLineItemsForPromotional(context, user, lineItems, callback);
    //             }
    //         ], function (error) {
    //             mockery.deregisterAll();
    //             mockery.disable();

    //             done(error);
    //         });
    //     });


    //     it('should fail if try to buy a promotional product that has never bought but quantity is more than 1', function (done) {
    //         var context,
    //             user = {},
    //             items = [
    //                 {variantId : 2, quantity : 1},
    //                 {variantId : 3, quantity : 2},
    //                 {variantId : 10, quantity : 3}
    //             ];

    //         mockery.enable();
    //         mockery.warnOnReplace(false);
    //         mockery.warnOnUnregistered(false);

    //         mockery.registerMock('../../../daos/User', function () {
    //             this.getBoughtVariantIdsOfUser = function (user, callback) {
    //                 callback(null, [2, 3]);
    //             };
    //         });

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 privateAPIes.getLineItems(context, user, items, callback);
    //             },

    //             function (lineItems, callback) {
    //                 user.id = context.user.userId;
    //                 privateAPIes.validateLineItemsForPromotional(context, user, lineItems, function (error) {
    //                     expect(error).to.be.instanceof(Error);
    //                     expect(error.errorCode).to.equal('InvalidLineItems');
    //                     expect(error.statusCode).to.equal(400);

    //                     callback();
    //                 });
    //             }
    //         ], function (error) {
    //             mockery.deregisterAll();
    //             mockery.disable();

    //             done(error);
    //         });
    //     });
    // });


    // describe('-generateOrderNumber()', function () {
    //     it('should generate number by id', function () {
    //         var number;

    //         number = privateAPIes.generateOrderNumber({id : 1}, 'G');
    //         expect(number).to.equal('G00000000001');

    //         number = privateAPIes.generateOrderNumber({id : 123}, 'G');
    //         expect(number).to.equal('G00000000123');
    //     });
    // });


    // describe('-getTotalPriceOfLineItems()', function () {
    //     it('should callback total price of given line items', function () {
    //         var lineItems = [
    //                 {price : 10, quantity : 5},
    //                 {price : 20, quantity : 2},
    //                 {price : 5, quantity : 2}
    //             ],
    //             totalPriceExpected = 100,
    //             totalPrice = privateAPIes.getTotalPriceOfLineItems(lineItems);

    //         expect(totalPrice).to.equal(totalPriceExpected);
    //     });
    // });


    // describe('-getCountriesOfLineItem()', function () {
    //     it('should callback countries of line item', function (done) {
    //         var lineItem = {
    //                 variant_id : 2
    //             },
    //             countriesExpected = [
    //                 {id : 1035, iso : 'CA'},
    //                 {id : 1214, iso : 'US'}
    //             ];

    //         async.waterfall([
    //             getContext,

    //             function (context, callback) {
    //                 privateAPIes.getCountriesOfLineItem(context, lineItem, callback);
    //             },

    //             function (countries, callback) {
    //                 expect(countries).to.be.ok;

    //                 expect(countries.map(function (item) {
    //                     return {
    //                         id : item.id,
    //                         iso : item.iso
    //                     };
    //                 }).sort(function (a, b) {
    //                     return a.id - b.id;
    //                 })).to.eql(countriesExpected);

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe.skip('-saveLineItems()', function () {
    //     it('should save line items with order_id of given order', function (done) {
    //         var context,
    //             order = {
    //                 id : 5899282
    //             },
    //             lineItemsToSave = [
    //                 {variant_id : 1, price : 10, quantity : 5},
    //                 {variant_id : 2, price : 20, quantity : 2},
    //                 {variant_id : 3, price : 5, quantity : 2}
    //             ],
    //             ids;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 privateAPIes.saveLineItems(context, order, lineItemsToSave, callback);
    //             },

    //             function (lineItemsSaved, callback) {
    //                 ids = lineItemsSaved.map(function (item) {
    //                     return item.id;
    //                 });

    //                 context.models.LineItem.findAll({
    //                     where : {
    //                         id : ids
    //                     }
    //                 }).success(callback.bind(this, null)).error(callback);
    //             },

    //             function (lineItemsFound, callback) {
    //                 // clean up
    //                 async.forEachSeries(ids, function (eachId, callback) {
    //                     context.models.LineItem.build({
    //                         id : eachId
    //                     }).destroy().success(function () {
    //                         callback();
    //                     }).error(callback);
    //                 }, function (error) {
    //                     if (error) {
    //                         callback(error);
    //                         return;
    //                     }
    //                     callback(null, lineItemsFound);
    //                 });
    //             },

    //             function (lineItemsFound, callback) {
    //                 expect(lineItemsFound).to.be.ok;
    //                 expect(lineItemsFound.length).to.be.equal(lineItemsToSave.length);

    //                 lineItemsFound.forEach(function (item) {
    //                     expect(item.order_id).to.equal(order.id);
    //                 });

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('-calculateAdjustmentsOfOrderViaCalculator()', function () {
    //     it('no shipping and tax amount', function (done) {
    //         var context,
    //             items = [
    //                 {variantId : 1009, quantity : 1}
    //             ],
    //             order = {
    //                 shipping_method_id : 4
    //             },
    //             adjustmentsExpected = {
    //                 shipping : null,
    //                 taxes : []
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 context.models.User.find(context.user.userId).done(callback);
    //             },

    //             function (user, callback) {
    //                 order.user = user;
    //                 privateAPIes.getLineItems(context, user, items, callback);
    //             },

    //             function (lineItems, callback) {
    //                 order.lineItems = lineItems;
    //                 context.models.Address.find(order.user.ship_address_id).done(callback);
    //             },

    //             function (shippingAddress, callback) {
    //                 order.shippingAddress = shippingAddress;
    //                 privateAPIes.calculateAdjustmentsOfOrderViaCalculator(context, order, callback);
    //             },

    //             function (adjustments, callback) {
    //                 expect(adjustments).to.eql(adjustmentsExpected);
    //                 callback();
    //             }

    //         ], done);
    //     });
    // });


    // describe('-deleteProductCatalogCacheIfNecessary()', function () {
    //     it('should delete cache if contain promotional product', function (done) {
    //         var context,
    //             cacheHelper = require('../../../lib/cacheHelper'),
    //             originalMethod,
    //             order = {},
    //             items = [
    //                 {variantId : 1, quantity : 5},
    //                 {variantId : 10, quantity : 1}
    //             ],
    //             deleted = false;

    //         originalMethod = cacheHelper.del;
    //         cacheHelper.del = function (context, key, callback) {
    //             expect(key).to.equal('ProductCatalogs_' + context.user.distributorId);
    //             deleted = true;
    //             callback();
    //         };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;
    //                 order.user = {
    //                     id : context.user.userId
    //                 };

    //                 privateAPIes.getLineItems(context, order.user, items, callback);
    //             },

    //             function (lineItems, callback) {
    //                 order.lineItems = lineItems;

    //                 privateAPIes.deleteProductCatalogCacheIfNecessary(context, order, function (error) {
    //                     if (error) {
    //                         callback(error);
    //                         return;
    //                     }

    //                     expect(deleted).to.equal(true);
    //                     callback();
    //                 });
    //             }
    //         ], function (error) {
    //             cacheHelper.del = originalMethod;

    //             done(error);
    //         });
    //     });


    //     it('should not delete cache if not contain promotional product', function (done) {
    //         var context,
    //             cacheHelper = require('../../../lib/cacheHelper'),
    //             originalMethod,
    //             order = {},
    //             items = [
    //                 {variantId : 2, quantity : 1},
    //                 {variantId : 3, quantity : 2},
    //                 {variantId : 4, quantity : 3}
    //             ],
    //             deleted = false;

    //         originalMethod = cacheHelper.del;
    //         cacheHelper.del = function (context, key, callback) {
    //             callback(new Error('Should not delete.'));
    //         };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;
    //                 order.user = {
    //                     id : context.user.userId
    //                 };

    //                 privateAPIes.getLineItems(context, order.user, items, callback);
    //             },

    //             function (lineItems, callback) {
    //                 order.lineItems = lineItems;

    //                 privateAPIes.deleteProductCatalogCacheIfNecessary(context, order, function (error) {
    //                     if (error) {
    //                         callback(error);
    //                         return;
    //                     }

    //                     expect(deleted).to.equal(false);
    //                     callback();
    //                 });
    //             }
    //         ], function (error) {
    //             cacheHelper.del = originalMethod;

    //             done(error);
    //         });
    //     });
    // });


    // describe('-getAddressesOfOrder()', function () {
    //     it('should work', function (done) {
    //         var order = {
    //                 id : 5899267,
    //                 bill_address_id : 2761,
    //                 ship_address_id : 372692
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (context, callback) {
    //                 privateAPIes.getAddressesOfOrder(context, order, callback);
    //             },

    //             function (callback) {
    //                 expect(order.billingAddress).to.be.ok;
    //                 expect(order.billingAddress.id).to.equal(order.bill_address_id);
    //                 expect(order.shippingAddress).to.be.ok;
    //                 expect(order.shippingAddress.id).to.equal(order.ship_address_id);

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('-getPaymentGatewayAddressOfOrder()', function () {
    //     it('should callback order.shippingAddress as payment gateway address if the country of which is active', function (done) {
    //         var context,
    //             order = {
    //                 id : 5899267,
    //                 bill_address_id : 2761,
    //                 ship_address_id : 372692
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 privateAPIes.getAddressesOfOrder(context, order, callback);
    //             },

    //             function (callback) {
    //                 expect(order.billingAddress).to.be.ok;
    //                 expect(order.billingAddress.id).to.equal(order.bill_address_id);
    //                 expect(order.shippingAddress).to.be.ok;
    //                 expect(order.shippingAddress.id).to.equal(order.ship_address_id);

    //                 privateAPIes.getPaymentGatewayAddressOfOrder(context, order, callback);
    //             },

    //             function (paymentGatewayAddress, callback) {
    //                 expect(paymentGatewayAddress).to.equal(order.shippingAddress);

    //                 callback();
    //             }
    //         ], done);
    //     });


    //     it('if country of order.shippingAddress is inactive, we should use order.user.soldAddress as payment gateway address if the currency of the address is as same as the currency of the order', function (done) {
    //         var context,
    //             order = {
    //                 id : 5899267,
    //                 currency_id : 149,
    //                 shippingAddress : {
    //                     country_id : 1041   // China, which is inactive
    //                 },
    //                 user : {
    //                     sold_address_id : 742623
    //                 }
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 privateAPIes.getPaymentGatewayAddressOfOrder(context, order, callback);
    //             },

    //             function (paymentGatewayAddress, callback) {
    //                 expect(paymentGatewayAddress.id).to.equal(order.user.sold_address_id);

    //                 callback();
    //             }
    //         ], done);
    //     });


    //     it('callback the address of a country, which the first product sold in and use the same currency as order.currency', function (done) {
    //         var context,
    //             order = {
    //                 id : 5899267,
    //                 currency_id : 27,
    //                 lineItems : [
    //                     {variant_id : 2}
    //                 ],
    //                 shippingAddress : {
    //                     country_id : 1041   // China, which is inactive
    //                 },
    //                 user : {
    //                     sold_address_id : 742623
    //                 }
    //             },
    //             addressExpected = {
    //                 country_id : 1035
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 privateAPIes.getPaymentGatewayAddressOfOrder(context, order, callback);
    //             },

    //             function (paymentGatewayAddress, callback) {
    //                 expect(paymentGatewayAddress).to.eql(addressExpected);

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('-getAvailableNoCreditcardPaymentMethods()', function () {
    //     it('should exclude `check` and `hyperwallet` payment methods', function (done) {
    //         var context,
    //             paymentMethods = [
    //                 {
    //                     id : 1,
    //                     name : 'Check'
    //                 },
    //                 {
    //                     id : 1024,
    //                     name : 'Hyperwallet US'
    //                 },
    //                 {
    //                     id : 3120,
    //                     name : 'Creadit Card (US)'
    //                 }
    //             ],
    //             paymentMethodsExpected = [
    //                 {
    //                     id : 3120,
    //                     name : 'Creadit Card (US)'
    //                 }
    //             ];

    //         async.waterfall([
    //             function (callback) {
    //                 privateAPIes.getAvailableNoCreditcardPaymentMethods(paymentMethods, callback);
    //             },

    //             function (paymentMethods, callback) {
    //                 expect(paymentMethods).to.be.ok;
    //                 expect(paymentMethods.map(function (item) {
    //                     return {
    //                         id : item.id,
    //                         name : item.name
    //                     };
    //                 })).to.eql(paymentMethodsExpected);

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('-getAvailableCreditcardPaymentMethod()', function () {
    //     it('should callback at most one creditcard payment method', function (done) {
    //         var context,
    //             order = {
    //                 id : 5899267,
    //                 bill_address_id : 2761,
    //                 ship_address_id : 372692
    //             },
    //             paymentMethodExpected = {
    //                 id: 3120,
    //                 type: 'Gateway::Verifi',
    //                 name: 'Credit Card (US)'
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 privateAPIes.getAddressesOfOrder(context, order, callback);
    //             },

    //             function (callback) {
    //                 expect(order.billingAddress).to.be.ok;
    //                 expect(order.billingAddress.id).to.equal(order.bill_address_id);
    //                 expect(order.shippingAddress).to.be.ok;
    //                 expect(order.shippingAddress.id).to.equal(order.ship_address_id);

    //                 privateAPIes.getPaymentMethodsOfOrder(context, order, callback);
    //             },

    //             function (paymentMethods, callback) {
    //                 privateAPIes.getAvailableCreditcardPaymentMethod(context, order.shippingAddress.country_id, paymentMethods, callback);
    //             },

    //             function (creditcardPaymentMethod, callback) {
    //                 expect(creditcardPaymentMethod).to.not.be.instanceof(Array);
    //                 expect({
    //                     id : creditcardPaymentMethod.id,
    //                     type : creditcardPaymentMethod.type,
    //                     name : creditcardPaymentMethod.name
    //                 }).to.eql(paymentMethodExpected);

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('-getAvailablePaymentMethodsOfOrder()', function () {
    //     it.skip('should callback payment methods available for given order', function (done) {
    //         var context,
    //             order = {
    //                 id : 5899267,
    //                 bill_address_id : 2761,
    //                 ship_address_id : 372692
    //             },
    //             paymentMethodsExpected = [
    //                 {
    //                     id: 3120,
    //                     type: 'Gateway::Verifi',
    //                     name: 'Credit Card (US)'
    //                 }
    //             ];

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 privateAPIes.getAddressesOfOrder(context, order, callback);
    //             },

    //             function (callback) {
    //                 expect(order.billingAddress).to.be.ok;
    //                 expect(order.billingAddress.id).to.equal(order.bill_address_id);
    //                 expect(order.shippingAddress).to.be.ok;
    //                 expect(order.shippingAddress.id).to.equal(order.ship_address_id);

    //                 privateAPIes.getAvailablePaymentMethodsOfOrder(context, order, callback);
    //             },

    //             function (paymentMethods, callback) {
    //                 expect(paymentMethods).to.be.ok;
    //                 expect(paymentMethods.map(function (item) {
    //                     return {
    //                         id : item.id,
    //                         type : item.type,
    //                         name : item.name
    //                     };
    //                 })).to.eql(paymentMethodsExpected);

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('-isPaymentMethodAvailableToOrder()', function () {
    //     // TODO: finish this
    //     it('should callback true if given payment method is available to order');
    // });


    // describe('-getLineItemsOfOrder()', function () {
    //     it('should work', function (done) {
    //         var context,
    //             orderDao,
    //             order;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;
    //                 orderDao = new OrderDao(context);

    //                 createOrderOfUS(context, {}, callback);
    //             },

    //             function (result, callback) {
    //                 order = result;
    //                 privateAPIes.getLineItemsOfOrder(context, {id : order.id}, callback);
    //             },

    //             function (lineItems, callback) {
    //                 expect(lineItems).to.be.instanceof(Array);
    //                 lineItems.forEach(function (lineItem) {
    //                     expect(lineItem.variant).to.be.ok;
    //                 });

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('-sendConfirmMailOfOrder()', function () {
    //     it('should work', function (done) {
    //         var context,
    //             jobName = 'resque:ogproj:queue:order_mailing_job';

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;
    //                 context.redisClient.del(jobName, callback);
    //             },

    //             function (result, callback) {
    //                 privateAPIes.sendConfirmMailOfOrder(context, {id : 123}, callback);
    //             },

    //             function (callback) {
    //                 context.redisClient.llen(jobName, callback);
    //             },

    //             function (jobLength, callback) {
    //                 expect(jobLength).to.equal(1);
    //                 context.redisClient.lpop(jobName, callback);
    //             },

    //             function (jobData, callback) {
    //                 expect(jobData).to.eql({
    //                     class : 'ResqueJobs::OrderMailingJob',
    //                     args : ['confirm_email', 123]
    //                 });
    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('checkoutOrder()', function () {
    //     it('should work', function (done) {
    //         var context,
    //             items = [
    //                 {variantId : 24, quantity : 1, catalogCode : 'SP'},
    //                 {variantId : 34, quantity : 2, catalogCode : 'SP'}
    //             ],
    //             options = {
    //                 lineItems : items
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 var orderDao = new OrderDao(context);
    //                 options.userId = context.user.userId;
    //                 orderDao.checkoutOrder(options, callback);
    //             },

    //             function (order, callback) {
    //                 expect(order).to.be.ok;
    //                 expect(order.id).to.be.not.ok;
    //                 expect(order.total).to.equal(order.item_total + order.adjustment_total);
    //                 expect(order.shipping_method_id).to.equal(order.shippingMethod.id);

    //                 console.log(mapper.order(order));

    //                 callback();
    //             }
    //         ], done);
    //     });

    //     it('CA: free shipping if item_total > 500', function (done) {
    //         var context,
    //             items = [
    //                 {variantId : 12, quantity : 1},
    //                 {variantId : 51, quantity : 1}
    //             ],
    //             options = {
    //                 lineItems : items
    //             };

    //         async.waterfall([
    //             getContextOfCA,

    //             function (result, callback) {
    //                 context = result;

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.checkoutOrder(options, callback);
    //             },

    //             function (order, callback) {
    //                 expect(order).to.be.ok;

    //                 var shippingAmount = 0;
    //                 order.adjustments.forEach(function (adjustment) {
    //                     if (adjustment.originator_type === 'ShippingMethod') {
    //                         shippingAmount += adjustment.amount;
    //                     }
    //                 });
    //                 expect(shippingAmount).to.equal(0);
    //                 console.log(mapper.order(order));

    //                 callback();
    //             }
    //         ], done);
    //     });

    //     it('should select non-pickup shipping method by default', function (done) {
    //         var context,
    //             items = [
    //                 {variantId : 12, quantity : 1},
    //                 {variantId : 51, quantity : 1}
    //             ],
    //             options = {
    //                 lineItems : items
    //             };

    //         async.waterfall([
    //             getContextOfCA,

    //             function (result, callback) {
    //                 context = result;

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.checkoutOrder(options, callback);
    //             },

    //             function (order, callback) {
    //                 expect(order).to.be.ok;
    //                 expect(order.shipping_method_id).to.equal(order.shippingMethod.id);
    //                 expect(order.shippingMethod.shippingAddressChangeable).to.equal(true);

    //                 callback();
    //             }
    //         ], done);
    //     });

    //     it('should fail if line items contains product does not sell in the country of user', function (done) {
    //         var context,
    //             items = [
    //                 {variantId : 12, quantity : 1},
    //                 {variantId : 100, quantity : 1}
    //             ],
    //             options = {
    //                 lineItems : items
    //             };

    //         async.waterfall([
    //             getContextOfCA,

    //             function (result, callback) {
    //                 context = result;

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.checkoutOrder(options, function (error, order) {
    //                     expect(error).to.be.instanceof(Error);
    //                     expect(order).to.be.not.ok;
    //                     expect(error.errorCode).to.equal('InvalidLineItems');
    //                     console.log(error.message);

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });

    //     it('checkout when registering', function (done) {
    //         var context,
    //             items = [
    //                 {variantId : 12, quantity : 1},
    //                 {variantId : 15, quantity : 2},
    //                 {variantId : 64, quantity : 2}
    //             ],
    //             address = {
    //                 firstname : 'Mike',
    //                 lastname : 'Jim',
    //                 address1 : '111 Autumn Drive',
    //                 city : 'LANCASTER',
    //                 country_id : 1214,
    //                 state_id : 10049,
    //                 zipcode : '43130'
    //             },
    //             options = {
    //                 lineItems : items,
    //                 registration : true,
    //                 homeAddress : address,
    //                 shippingAddress : address,
    //                 billingAddress : address
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.checkoutOrder(options, callback);
    //             },

    //             function (order, callback) {
    //                 expect(order).to.be.ok;
    //                 expect(order.id).to.be.not.ok;
    //                 expect(order.total).to.equal(order.item_total + order.adjustment_total);
    //                 expect(order.shipping_method_id).to.equal(order.shippingMethod.id);

    //                 console.log(mapper.order(order));

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('getAdjustments()', function () {
    //     it('should work', function (done) {
    //         var context,
    //             items = [
    //                 {variantId : 12, quantity : 1},
    //                 {variantId : 15, quantity : 2}
    //             ],
    //             address = {
    //                 firstname : 'Mike',
    //                 lastname : 'Jim',
    //                 address1 : '111 Autumn Drive',
    //                 city : 'LANCASTER',
    //                 country_id : 1214,
    //                 state_id : 10049,
    //                 zipcode : '43130'
    //             },
    //             options = {
    //                 lineItems : items,
    //                 shippingAddress : address,
    //                 shippingMethodId : 4
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.getAdjustments(options, callback);
    //             },

    //             function (adjustments, callback) {
    //                 expect(adjustments).to.be.instanceof(Array);

    //                 callback();
    //             }
    //         ], done);
    //     });

    //     it('registration', function (done) {
    //         var context,
    //             items = [
    //                 {variantId : 12, quantity : 1},
    //                 {variantId : 15, quantity : 2}
    //             ],
    //             address = {
    //                 firstname : 'Mike',
    //                 lastname : 'Jim',
    //                 address1 : '111 Autumn Drive',
    //                 city : 'LANCASTER',
    //                 country_id : 1214,
    //                 state_id : 10049,
    //                 zipcode : '43130'
    //             },
    //             options = {
    //                 registration : true,
    //                 lineItems : items,
    //                 homeAddress : address,
    //                 shippingAddress : address,
    //                 billingAddress : address,
    //                 shippingMethodId : 4
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.getAdjustments(options, callback);
    //             },

    //             function (adjustments, callback) {
    //                 expect(adjustments).to.be.instanceof(Array);

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('createOrder()', function () {
    //     it('should work', function (done) {
    //         var context,
    //             items = [
    //                 {variantId : 12, quantity : 1, catalogCode : 'SP'},
    //                 {variantId : 15, quantity : 2, catalogCode : 'SP'}
    //             ],
    //             address = {
    //                 firstname : 'Mike',
    //                 lastname : 'Jim',
    //                 address1 : '111 Autumn Drive',
    //                 city : 'LANCASTER',
    //                 country_id : 1214,
    //                 state_id : 10049,
    //                 zipcode : '43130'
    //             },
    //             options = {
    //                 lineItems : items,
    //                 shippingAddress : address,
    //                 billingAddress : address,
    //                 shippingMethodId : 4,
    //                 paymentMethodId : 3003,
    //                 creditcard : testUtil.getTestCreditcardInfoOfNormal()
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 var orderDao = new OrderDao(context);
    //                 options.userId = context.user.userId;
    //                 orderDao.createOrder(options, callback);
    //             },

    //             function (order, callback) {
    //                 expect(order).to.be.ok;
    //                 expect(order.total).to.equal(order.item_total + order.adjustment_total);
    //                 expect(order.payment_total).to.equal(order.total);
    //                 expect(order.payment_state).to.equal('paid');

    //                 expect(order.distributor).to.equal(true);

    //                 callback();
    //                 //privateAPIes.deleteOrderById(context, order.id, callback);
    //             }
    //         ], done);
    //     });


    //     it('create order that is no need to ship', function (done) {
    //         var context,
    //             items = [
    //                 {variantId : 110, quantity : 1, catalogCode : 'GC'}
    //             ],
    //             address = {
    //                 firstname : 'Foo',
    //                 lastname : 'Bar',
    //                 address1 : '111 Autumn Drive',
    //                 city : 'LANCASTER',
    //                 country_id : 1213,
    //                 state_id : 10174,
    //                 zipcode : '43130'
    //             },
    //             options = {
    //                 lineItems : items,
    //                 billingAddress : address,
    //                 paymentMethodId : 1006,
    //                 creditcard : testUtil.getTestCreditcardInfoOfNormal()
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;
    //                 context.user.userId = 6;
    //                 options.userId = context.user.userId;

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.createOrder(options, callback);
    //             },

    //             function (order, callback) {
    //                 expect(order).to.be.ok;
    //                 expect(order.total).to.equal(order.item_total + order.adjustment_total);
    //                 expect(order.payment_total).to.equal(order.total);
    //                 expect(order.payment_state).to.equal('paid');

    //                 expect(order.distributor).to.equal(true);
    //                 console.log(mapper.order(order));

    //                 callback();
    //                 //privateAPIes.deleteOrderById(context, order.id, callback);
    //             }
    //         ], done);
    //     });


    //     it('save personalized values for line item', function (done) {
    //         var context,
    //             variantId = 404,
    //             items = [
    //                 {
    //                     variantId : variantId,
    //                     quantity : 1,
    //                     catalogCode : 'SP',
    //                     personalizedValues : [
    //                         { id : 1, value : 'test'}
    //                     ]
    //                 }
    //             ],
    //             address = {
    //                 firstname : 'Foo',
    //                 lastname : 'Bar',
    //                 address1 : '111 Autumn Drive',
    //                 city : 'LANCASTER',
    //                 country_id : 1214,
    //                 state_id : 10049,
    //                 zipcode : '43130'
    //             },
    //             options = {
    //                 lineItems : items,
    //                 shippingAddress : address,
    //                 billingAddress : address,
    //                 shippingMethodId : 4,
    //                 paymentMethodId : 3003,
    //                 creditcard : testUtil.getTestCreditcardInfoOfNormal()
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;
    //                 context.user.userId = 11160;
    //                 options.userId = context.user.userId;

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.createOrder(options, callback);
    //             },

    //             function (order, callback) {
    //                 expect(order).to.be.ok;

    //                 var queryDatabaseOptions = {
    //                         sqlStmt : "select pv.* from line_items_personalized_values pv inner join line_items li on pv.line_item_id=li.id where li.order_id=$1",
    //                         sqlParams : [order.id]
    //                     };

    //                 DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
    //                     if (error) {
    //                         callback(error);
    //                         return;
    //                     }

    //                     var rows = result.rows,
    //                         personlizedValue;

    //                     expect(rows.length).to.be.ok;
    //                     personalizedValue = rows[0];
    //                     expect(personalizedValue.personalized_type_id).to.equal(1);
    //                     expect(personalizedValue.line_item_id).to.equal(order.lineItems[0].id);
    //                     expect(personalizedValue.personalized_value).to.equal('test');

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });


    //     it('should support non-creditcard payment', function (done) {
    //         var context,
    //             items = [
    //                 {variantId : 12, quantity : 1},
    //                 {variantId : 15, quantity : 2}
    //             ],
    //             address = {
    //                 firstname : 'Mike',
    //                 lastname : 'Jim',
    //                 address1 : '111 Autumn Drive',
    //                 city : 'LANCASTER',
    //                 country_id : 1214,
    //                 state_id : 10049,
    //                 zipcode : '43130'
    //             },
    //             options = {
    //                 lineItems : items,
    //                 shippingAddress : address,
    //                 shippingMethodId : 4,
    //                 paymentMethodId : 3048,
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.createOrder(options, callback);
    //             },

    //             function (order, callback) {
    //                 expect(order).to.be.ok;
    //                 expect(order.total).to.equal(order.item_total + order.adjustment_total);
    //                 expect(order.payment_total).to.equal(0);
    //                 expect(order.payment_state).to.equal('balance_due');

    //                 expect(order.distributor).to.equal(true);

    //                 callback();
    //                 //privateAPIes.deleteOrderById(context, order.id, callback);
    //             }
    //         ], done);
    //     });


    //     it('CA: free shipping if item_total > 500', function (done) {
    //         var context,
    //             items = [
    //                 {variantId : 12, quantity : 1},
    //                 {variantId : 51, quantity : 1}
    //             ],
    //             options = {
    //                 lineItems : items,
    //                 shippingMethodId : 1,
    //                 paymentMethodId : 3001,
    //                 creditcard : testUtil.getTestCreditcardInfoOfNormal()
    //             };

    //         async.waterfall([
    //             getContextOfCA,

    //             function (result, callback) {
    //                 context = result;

    //                 context.readModels.User.find(context.user.userId).done(callback);
    //             },

    //             function (user, callback) {
    //                 context.readModels.Address.find(user.ship_address_id).done(callback);
    //             },

    //             function (shippingAddress, callback) {
    //                 options.shippingAddress = copyAddress(shippingAddress);
    //                 options.billingAddress = copyAddress(shippingAddress);

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.createOrder(options, callback);
    //             },

    //             function (order, callback) {
    //                 console.log(mapper.order(order));

    //                 expect(order).to.be.ok;
    //                 expect(order.total).to.equal(order.item_total + order.adjustment_total);
    //                 expect(order.payment_total).to.equal(order.total);
    //                 expect(order.payment_state).to.equal('paid');

    //                 var shippingAmount = 0;
    //                 order.adjustments.forEach(function (adjustment) {
    //                     if (adjustment.originator_type === 'ShippingMethod') {
    //                         shippingAmount += adjustment.amount;
    //                     }
    //                 });
    //                 expect(shippingAmount).to.equal(0);

    //                 callback();
    //                 //privateAPIes.deleteOrderById(context, order.id, callback);
    //             }
    //         ], done);
    //     });


    //     it('should not callback error if payment failed but order created', function (done) {
    //         mockery.enable();
    //         mockery.warnOnReplace(false);
    //         mockery.warnOnUnregistered(false);

    //         mockery.registerMock('../../../lib/paymentMethods/creditcard', {
    //             process : function (context, order, payment, callback) {
    //                 PaymentDao.updatePaymentState(context, payment, 'failed', null, function () {
    //                     callback(new Error('Payment failed.'));
    //                 });
    //             }
    //         });

    //         var context,
    //             items = [
    //                 {variantId : 12, quantity : 1},
    //                 {variantId : 15, quantity : 2}
    //             ],
    //             address = {
    //                 firstname : 'Mike',
    //                 lastname : 'Jim',
    //                 address1 : '111 Autumn Drive',
    //                 city : 'LANCASTER',
    //                 country_id : 1214,
    //                 state_id : 10049,
    //                 zipcode : '43130'
    //             },
    //             options = {
    //                 lineItems : items,
    //                 shippingAddress : address,
    //                 billingAddress : address,
    //                 shippingMethodId : 4,
    //                 paymentMethodId : 3120,
    //                 creditcard : testUtil.getTestCreditcardInfoOfNormal()
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.createOrder(options, function (error, order) {
    //                     expect(error).to.be.not.ok;
    //                     expect(order).to.be.ok;
    //                     expect(order.state).to.equal('payment');
    //                     expect(order.shipment_state).to.equal('pending');
    //                     expect(order.payment_state).to.equal('failed');
    //                     expect(order.payment_total).to.equal(0);

    //                     callback();
    //                 });
    //             }
    //         ], function () {
    //             mockery.deregisterAll();
    //             mockery.disable();

    //             done();
    //         });
    //     });


    //     it('should callback error if items is empty', function (done) {
    //         var context,
    //             items = [];

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.createOrder(items, function (error, order) {
    //                     expect(error).to.be.instanceof(Error);
    //                     expect(error.errorCode).to.equal('InvalidLineItems');
    //                     expect(order).to.be.not.ok;

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });


    //     it('should callback error if payment failed due to fraud prevention', function (done) {
    //         var context,
    //             fraudPrevention = require('../../../lib/fraudPrevention'),
    //             originalMethod,
    //             items = [
    //                 {variantId : 12, quantity : 1},
    //                 {variantId : 15, quantity : 2}
    //             ],
    //             address = {
    //                 firstname : 'Mike',
    //                 lastname : 'Jim',
    //                 address1 : '111 Autumn Drive',
    //                 city : 'LANCASTER',
    //                 country_id : 1214,
    //                 state_id : 10049,
    //                 zipcode : '43130'
    //             },
    //             options = {
    //                 lineItems : items,
    //                 shippingAddress : address,
    //                 billingAddress : address,
    //                 shippingMethodId : 4,
    //                 paymentMethodId : 3120,
    //                 creditcard : testUtil.getTestCreditcardInfoOfNormal()
    //             };

    //         originalMethod = fraudPrevention.isPaymentAllowed;
    //         fraudPrevention.isPaymentAllowed = function (context, order, payment, callback) {
    //             callback(null, false);
    //         };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.createOrder(options, function (error, order) {
    //                     expect(error).to.be.instanceof(Error);
    //                     expect(error.errorCode).to.equal('OverFraudPreventionLimit');

    //                     callback();
    //                 });
    //             }
    //         ], function () {
    //             fraudPrevention.isPaymentAllowed = originalMethod;

    //             done();
    //         });
    //     });


    //     it('should create payment and creditcard records even provide an invalid creditcard', function (done) {
    //         var context,
    //             items = [
    //                 {variantId : 12, quantity : 1},
    //                 {variantId : 15, quantity : 2}
    //             ],
    //             address = {
    //                 firstname : 'Mike',
    //                 lastname : 'Jim',
    //                 address1 : '111 Autumn Drive',
    //                 city : 'LANCASTER',
    //                 country_id : 1214,
    //                 state_id : 10049,
    //                 zipcode : '43130'
    //             },
    //             options = {
    //                 lineItems : items,
    //                 shippingAddress : address,
    //                 billingAddress : address,
    //                 shippingMethodId : 4,
    //                 paymentMethodId : 3120,
    //                 creditcard : testUtil.getTestCreditcardInfoWithInvalidCreditcard()
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.createOrder(options, function (error, order) {
    //                     expect(error).to.be.not.ok;
    //                     expect(order).to.be.ok;
    //                     expect(order.state).to.equal('payment');
    //                     expect(order.shipment_state).to.equal('pending');
    //                     expect(order.payment_state).to.equal('failed');
    //                     expect(order.payment_total).to.equal(0);
    //                     expect(order.id).to.be.ok;

    //                     callback(null, order);
    //                 });
    //             },

    //             function (order, callback) {
    //                 context.models.Payment.find({
    //                     where : { order_id : order.id }
    //                 }).done(function (error, payment) {
    //                     if (error) {
    //                         callback(error);
    //                         return;
    //                     }

    //                     expect(payment).to.be.ok;
    //                     expect(payment.order_id).to.equal(order.id);
    //                     expect(payment.state).to.equal('failed');
    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });


    //     it('create order with coupons', function (done) {
    //         var context,
    //             tick = (new Date()).getTime(),
    //             coupon1,
    //             coupon2,
    //             items = [
    //                 {variantId : 12, quantity : 2, catalogCode : 'SP'},
    //                 {variantId : 15, quantity : 1, catalogCode : 'SP'}
    //             ],
    //             address = {
    //                 firstname : 'Mike',
    //                 lastname : 'Jim',
    //                 address1 : '111 Autumn Drive',
    //                 city : 'LANCASTER',
    //                 country_id : 1214,
    //                 state_id : 10049,
    //                 zipcode : '43130'
    //             },
    //             options = {
    //                 lineItems : items,
    //                 shippingAddress : address,
    //                 billingAddress : address,
    //                 shippingMethodId : 4,
    //                 paymentMethodId : 3003,
    //                 creditcard : testUtil.getTestCreditcardInfoOfNormal()
    //             };

    //         mockupCreditcardPaymentMethodAlwaysSuccess();

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 context.models.Coupon.create({
    //                     code : 'coupon-' + tick + '1',
    //                     active : true,
    //                     is_single_user : false,
    //                     expired_at : null,
    //                     usage_count : 1,
    //                     rules : JSON.stringify({
    //                         allow_all_products : true,
    //                         commissionable_percentage : 0,
    //                         coupon_product_group_id : 0,
    //                         operation : 'percent_off',
    //                         operation_amount : 10,
    //                         total_units_allowed : 1
    //                     })
    //                 }).done(function (error, result) {
    //                     coupon1 = result;
    //                     callback(error);
    //                 });;
    //             },

    //             function (callback) {
    //                 context.models.Coupon.create({
    //                     code : 'coupon-' + tick + '2',
    //                     active : true,
    //                     is_single_user : false,
    //                     expired_at : null,
    //                     usage_count : 1,
    //                     rules : JSON.stringify({
    //                         allow_all_products : true,
    //                         commissionable_percentage : 0,
    //                         coupon_product_group_id : 0,
    //                         operation : 'percent_off',
    //                         operation_amount : 20,
    //                         total_units_allowed : 1
    //                     })
    //                 }).done(function (error, result) {
    //                     coupon2 = result;
    //                     callback(error);
    //                 });;
    //             },

    //             function (callback) {
    //                 var orderDao = new OrderDao(context);
    //                 options.userId = context.user.userId;
    //                 options.coupons = [{code : coupon1.code}, {code : coupon2.code}];
    //                 orderDao.createOrder(options, callback);
    //             },

    //             function (order, callback) {
    //                 expect(order).to.be.ok;
    //                 expect(order.total).to.equal(order.item_total + order.adjustment_total);
    //                 expect(order.payment_total).to.equal(order.total);
    //                 expect(order.payment_state).to.equal('paid');

    //                 expect(order.distributor).to.equal(true);

    //                 callback();
    //             }
    //         ], function (error) {
    //             mockery.deregisterAll();
    //             mockery.disable();

    //             done(error);
    //         });
    //     });
    // });


    // describe.skip('getAvailablePaymentMethodsOfOrder()', function () {
    //     it('should callback payment methods available for given order', function (done) {
    //         var orderId = 5899267,
    //             paymentMethodsExpected = [
    //                 {
    //                     id: 3120,
    //                     type: 'Gateway::Verify',
    //                     name: 'Credit Card (US)'
    //                 }
    //             ];

    //         async.waterfall([
    //             getContext,

    //             function (context, callback) {
    //                 var orderDao = new OrderDao(context);
    //                 orderDao.getAvailablePaymentMethodsOfOrder(orderId, callback);
    //             },

    //             function (paymentMethods, callback) {
    //                 expect(paymentMethods).to.be.ok;
    //                 expect(paymentMethods.map(function (item) {
    //                     return {
    //                         id : item.id,
    //                         type : item.type,
    //                         name : item.name
    //                     };
    //                 })).to.eql(paymentMethodsExpected);

    //                 callback();
    //             }
    //         ], done);
    //     });


    //     it.skip('should callback error if try to get order of other\'s', function (done) {
    //         var context,
    //             orderId = 5899282,
    //             order;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;
    //                 var orderDao = new OrderDao(context);
    //                 orderDao.getAvailablePaymentMethodsOfOrder(orderId, function (error, order) {
    //                     expect(error).to.be.instanceof(Error);
    //                     expect(order).to.be.not.ok;

    //                     expect(error.errorCode).to.equal('NoPermissionToGetOrder');
    //                     expect(error.statusCode).to.equal(403);

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });


    //     it("should callback error if order doesn't exist", function (done) {
    //         var context,
    //             orderId = 123,
    //             order;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;
    //                 var orderDao = new OrderDao(context);
    //                 orderDao.getAvailablePaymentMethodsOfOrder(orderId, function (error, order) {
    //                     expect(error).to.be.instanceof(Error);
    //                     expect(order).to.be.not.ok;

    //                     expect(error.errorCode).to.equal('OrderNotFound');
    //                     expect(error.statusCode).to.equal(404);

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });
    // });


    // describe.skip('getOrderInfo()', function () {
    //     it('should callback order by given order id', function (done) {
    //         var context,
    //             orderId = 5899267,
    //             order;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;
    //                 var orderDao = new OrderDao(context);
    //                 orderDao.getOrderInfo(orderId, callback);
    //             },

    //             function (result, callback) {
    //                 order = result;

    //                 expect(order).to.be.ok;
    //                 expect(order.shippingAddress).to.be.ok;
    //                 expect(order.billingAddress).to.be.ok;
    //                 expect(order.lineItems).to.be.ok;
    //                 expect(order.adjustments).to.be.ok;
    //                 expect(order.payments).to.be.ok;
    //                 expect(order.shipments).to.be.ok;
    //                 expect(order.availableShippingMethods).to.be.ok;
    //                 expect(order.availablePaymentMethods).to.be.ok;

    //                 callback();
    //             }
    //         ], done);
    //     });


    //     it('should callback error if try to get order of other\'s', function (done) {
    //         var context,
    //             orderId = 5899282,
    //             order;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;
    //                 var orderDao = new OrderDao(context);
    //                 orderDao.getOrderInfo(orderId, function (error, order) {
    //                     expect(error).to.be.instanceof(Error);
    //                     expect(order).to.be.not.ok;

    //                     expect(error.errorCode).to.equal('NoPermissionToGetOrder');
    //                     expect(error.statusCode).to.equal(403);

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });


    //     it("should callback error if order doesn't exist", function (done) {
    //         var context,
    //             orderId = 123,
    //             order;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;
    //                 var orderDao = new OrderDao(context);
    //                 orderDao.getOrderInfo(orderId, function (error, order) {
    //                     expect(error).to.be.instanceof(Error);
    //                     expect(order).to.be.not.ok;

    //                     expect(error.errorCode).to.equal('OrderNotFound');
    //                     expect(error.statusCode).to.equal(404);

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });
    // });


    // describe('getAvailableShippingMethodsByCountryIdAndStateId()', function () {
    //     it('should callback available shipping methods', function (done) {
    //         var countryId = 1214,
    //             stateId = 10049,
    //             context,
    //             orderDao,
    //             shippingMethodsExpected = [
    //                 {
    //                     id : 4,
    //                     name : 'US Ground'
    //                 }
    //             ];

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.getAvailableShippingMethodsByCountryIdAndStateId(countryId, stateId, callback);
    //             },

    //             function (shippingMethods, callback) {
    //                 expect(shippingMethods.map(function (item) {
    //                     return {
    //                         id : item.id,
    //                         name : item.name
    //                     };
    //                 })).to.eql(shippingMethodsExpected);

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('getAvailablePaymentMethodsByCountryId()', function () {
    //     it('should callback available payment methods', function (done) {
    //         var countryId = 1214,
    //             context,
    //             orderDao,
    //             paymentMethodsExpected = [
    //                 {
    //                     id : 3120,
    //                     name : 'Credit Card (US)'
    //                 }
    //             ];

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 var orderDao = new OrderDao(context);
    //                 orderDao.getAvailablePaymentMethodsByCountryId(countryId, callback);
    //             },

    //             function (paymentMethods, callback) {
    //                 expect(paymentMethods.map(function (item) {
    //                     return {
    //                         id : item.id,
    //                         name : item.name
    //                     };
    //                 })).to.eql(paymentMethodsExpected);

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });


    // describe('payOrderById()', function () {
    //     it('should callback error if orderId is 0', function (done) {
    //         var context,
    //             orderId;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;
    //                 orderDao = new OrderDao(context);
    //                 orderDao.payOrderById({}, function (error, order) {
    //                     expect(error).to.be.instanceof(Error);
    //                     expect(error.errorCode).to.equal('OrderNotFound');

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });
    // });


    // describe('changeOrderBillingAddress()', function () {
    //     it('should callback new billing address', function (done) {
    //         var context,
    //             orderDao,
    //             order,
    //             oldAddressId,
    //             newAddressData;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;
    //                 orderDao = new OrderDao(context);

    //                 createOrderOfUS(context, {doNotPay : true}, callback);
    //             },

    //             function (result, callback) {
    //                 order = result;
    //                 privateAPIes.getAddressesOfOrder(context, order, callback);
    //             },

    //             function (callback) {
    //                 var oldAddress = order.billingAddress;
    //                 newAddressData = {
    //                     firstname : oldAddress.firstname,
    //                     middleabbr : oldAddress.middleabbr,
    //                     lastname : oldAddress.lastname,
    //                     phone : oldAddress.phone,
    //                     address1 : oldAddress.address1,
    //                     address2 : oldAddress.address2,
    //                     city : oldAddress.city,
    //                     zipcode : oldAddress.zipcode,
    //                     state_id : oldAddress.state_id,
    //                     country_id : oldAddress.country_id
    //                 };
    //                 orderDao.changeOrderBillingAddress(order.id, newAddressData, callback);
    //             },

    //             function (newBillingAddress, callback) {
    //                 expect(newBillingAddress.id).to.not.equal(oldAddressId);
    //                 Object.keys(newAddressData).forEach(function (key) {
    //                     expect(newBillingAddress[key]).to.equal(newAddressData[key]);
    //                 });

    //                 orderDao.getById(order.id, function (error, changedOrder) {
    //                     if (error) {
    //                         callback(error);
    //                         return;
    //                     }

    //                     expect(changedOrder.bill_address_id).to.equal(newBillingAddress.id);
    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });


    //     it('CA: should callback new billing address', function (done) {
    //         var context,
    //             orderDao,
    //             order,
    //             oldAddressId,
    //             newAddressData;

    //         async.waterfall([
    //             getContextOfCA,

    //             function (result, callback) {
    //                 context = result;
    //                 orderDao = new OrderDao(context);

    //                 createOrderOfCA(context, {doNotPay : true}, callback);
    //             },

    //             function (result, callback) {
    //                 order = result;
    //                 privateAPIes.getAddressesOfOrder(context, order, callback);
    //             },

    //             function (callback) {
    //                 var oldAddress = order.billingAddress;
    //                 newAddressData = {
    //                     firstname : 'Master',
    //                     middleabbr : 'm1',
    //                     lastname : 'Distributor',
    //                     phone : '888.845.3990',
    //                     address1 : '100 Bel Air Drive',
    //                     address2 : '',
    //                     city : 'Oakville',
    //                     zipcode : 'L6J 7N1',
    //                     state_id : 10009,
    //                     country_id : 1035
    //                 };
    //                 orderDao.changeOrderBillingAddress(order.id, newAddressData, callback);
    //             },

    //             function (newBillingAddress, callback) {
    //                 expect(newBillingAddress.id).to.not.equal(oldAddressId);
    //                 Object.keys(newAddressData).forEach(function (key) {
    //                     expect(newBillingAddress[key]).to.equal(newAddressData[key]);
    //                 });

    //                 orderDao.getById(order.id, function (error, changedOrder) {
    //                     if (error) {
    //                         callback(error);
    //                         return;
    //                     }

    //                     expect(changedOrder.bill_address_id).to.equal(newBillingAddress.id);
    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });
    // });


    // describe.skip('changeOrderShippingAddress()', function () {
    //     it('should callback new shipping address', function (done) {
    //         var context,
    //             orderDao,
    //             order,
    //             oldAddressId,
    //             newAddressData;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;
    //                 orderDao = new OrderDao(context);
    //                 createOrderOfUS(context, {doNotPay : true}, callback);
    //             },

    //             function (result, callback) {
    //                 order = result;
    //                 privateAPIes.getAddressesOfOrder(context, order, callback);
    //             },

    //             function (callback) {
    //                 var oldAddress = order.shippingAddress;
    //                 newAddressData = {
    //                     firstname : oldAddress.firstname,
    //                     middleabbr : oldAddress.middleabbr,
    //                     lastname : oldAddress.lastname,
    //                     phone : oldAddress.phone,
    //                     address1 : oldAddress.address1,
    //                     address2 : oldAddress.address2,
    //                     city : oldAddress.city,
    //                     zipcode : oldAddress.zipcode,
    //                     state_id : oldAddress.state_id,
    //                     country_id : oldAddress.country_id
    //                 };
    //                 orderDao.changeOrderShippingAddress(order.id, newAddressData, callback);
    //             },

    //             function (newShippingAddress, callback) {
    //                 expect(newShippingAddress.id).to.not.equal(oldAddressId);
    //                 Object.keys(newAddressData).forEach(function (key) {
    //                     expect(newShippingAddress[key]).to.equal(newAddressData[key]);
    //                 });

    //                 orderDao.getById(order.id, function (error, changedOrder) {
    //                     if (error) {
    //                         callback(error);
    //                         return;
    //                     }

    //                     expect(changedOrder.ship_address_id).to.equal(newShippingAddress.id);
    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });
    // });


    // describe.skip('changeOrderShippingMethod()', function () {
    //     it('should callback new shipping method', function (done) {
    //         var orderId = 5899267,
    //             shippingMethodId = 4;

    //         async.waterfall([
    //             getContext,

    //             function (context, callback) {
    //                 var orderDao = new OrderDao(context);
    //                 orderDao.changeOrderShippingMethod(orderId, shippingMethodId, callback);
    //             },

    //             function (shippingMethod, callback) {
    //                 expect(shippingMethod).to.be.ok;
    //                 expect(shippingMethod.id).to.equal(shippingMethodId);

    //                 callback();
    //             }
    //         ], done);
    //     });


    //     it('is not allowed to change shipping method of other\'s order', function (done) {
    //         var orderId = 5899282,
    //             shippingMethodId = 4;

    //         async.waterfall([
    //             getContext,

    //             function (context, callback) {
    //                 var orderDao = new OrderDao(context);
    //                 orderDao.changeOrderShippingMethod(orderId, shippingMethodId, function (error, shippingMethod) {
    //                     expect(error).to.be.ok;
    //                     expect(shippingMethod).to.be.not.ok;

    //                     expect(error.errorCode).to.equal('NoPermissionToChangeOrder');

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });


    //     it('is not allowed to change shipping method of order if the shipping method is not available', function (done) {
    //         var orderId = 5899267,
    //             shippingMethodId = 1;

    //         async.waterfall([
    //             getContext,

    //             function (context, callback) {
    //                 var orderDao = new OrderDao(context);
    //                 orderDao.changeOrderShippingMethod(orderId, shippingMethodId, function (error, shippingMethod) {
    //                     expect(error).to.be.ok;
    //                     expect(shippingMethod).to.be.not.ok;

    //                     expect(error.errorCode).to.equal('ShippingMethodIsNotAvailable');

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });
    // });


    // describe("createReturnAuthorization()", function () {
    //     it('should create record in return_authorizations table.', function (done) {
    //         var context,
    //             orderDao,
    //             order;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 createOrderOfUS(context, {doNotPay : true}, callback);
    //             },

    //             function (result, callback) {
    //                 order = result;
    //                 orderDao = new OrderDao(context);

    //                 context.models.Order.find(order.id).done(function (error, order) {
    //                     if (error) {
    //                         callback(error);
    //                         return;
    //                     }

    //                     order.shipment_state = 'shipped';
    //                     order.save().done(function (error) {
    //                         callback(error);
    //                     });
    //                 });
    //             },

    //             function (callback) {
    //                 var createReturnAuthorizationOptions = {
    //                         orderId : order.id,
    //                         amount : 0.12,
    //                         reason : 'test',
    //                         lineItems : [
    //                             { variantId :  24, quantity : 1}
    //                         ]
    //                     };

    //                 orderDao.createReturnAuthorization(createReturnAuthorizationOptions, function (error, returnAuthorization) {
    //                     expect(error).to.be.not.ok;
    //                     expect(returnAuthorization).to.be.ok;

    //                     expect(returnAuthorization.order_id).to.equal(order.id);
    //                     expect(returnAuthorization.number).to.equal("RMA-" + order.number + "-001");
    //                     expect(returnAuthorization.state).to.equal('authorized');
    //                     expect(returnAuthorization.amount).to.equal(0.12);
    //                     expect(returnAuthorization.reason).to.equal('test');

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });
    // });


    // describe("addOrderAdjustment()", function () {
    //     it('should create record in adjustments table.', function (done) {
    //         var context,
    //             orderDao,
    //             order;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 createOrderOfUS(context, {doNotPay : true}, callback);
    //             },

    //             function (result, callback) {
    //                 order = result;
    //                 orderDao = new OrderDao(context);

    //                 context.models.Order.find(order.id).done(function (error, order) {
    //                     if (error) {
    //                         callback(error);
    //                         return;
    //                     }

    //                     order.shipment_state = 'shipped';
    //                     order.save().done(function (error) {
    //                         callback(error);
    //                     });
    //                 });
    //             },

    //             function (callback) {
    //                 var addOrderAdjustmentOptions = {
    //                         orderId : order.id,
    //                         label : 'test',
    //                         amount : 1.23
    //                     };

    //                 orderDao.addOrderAdjustment(addOrderAdjustmentOptions, function (error, savedOrder) {
    //                     expect(error).to.be.not.ok;
    //                     expect(savedOrder).to.be.ok;

    //                     expect(savedOrder.total).equal(order.total + 1.23);
    //                     expect(savedOrder.adjustment_total).equal(order.adjustment_total + 1.23);

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });
    // });

    // describe('-getConfirmMailDataOfOrder()', function () {
    //     it('should work', function (done) {
    //         var context,
    //             orderDao,
    //             order;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 createOrderOfUS(context, {doNotPay : true}, callback);
    //             },

    //             function (result, callback) {
    //                 order = result;
    //                 OrderDao.__get__('getConfirmMailDataOfOrder')(context, order, callback);
    //             },

    //             function (mailData, callback) {
    //                 console.log(mailData);
    //                 callback();
    //             }
    //         ], done);

    //     });
    // });
});


/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var util = require('util');

var sutPath = '../../../daos/ReturnAuthorization.js';
var ReturnAuthorizationDao = require(sutPath);

var DAO = require('../../../daos/DAO');
var OrderDao = require('../../../daos/Order');


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        redis : true,
        user : true
    }, callback);
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
            paymentMethodId : 3004,
            creditcard : testUtil.getTestCreditcardInfoOfNormal(),
            doNotPay : options.doNotPay
        },
        orderDao = new OrderDao(context);

    orderDao.createOrder(createOrderOptions, callback);
}


describe('daos/ReturnAuthorization', function () {
    describe('receiveReturnAuthorization()', function () {
        it('should work', function (done) {
            var context,
                orderDao,
                order;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    createOrderOfUS(context, {doNotPay : false}, callback);
                },

                function (result, callback) {
                    order = result;
                    orderDao = new OrderDao(context);

                    context.models.Order.find(order.id).done(function (error, order) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        order.shipment_state = 'shipped';
                        order.payment_total = order.total;
                        order.payment_state = 'paid';
                        order.save().done(function (error) {
                            callback(error);
                        });
                    });
                },

                function (callback) {
                    var queryDatabaseOptions = {
                            sqlStmt : "update inventory_units set state = 'shipped' where order_id= $1",
                            sqlParams : [order.id]
                        };
                    DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                        callback(error);
                    });
                },

                function (callback) {
                    var createReturnAuthorizationOptions = {
                            orderId : order.id,
                            amount : 0.12,
                            reason : 'test',
                            lineItems : [
                                { variantId :  24, quantity : 1}
                            ]
                        };

                    orderDao.createReturnAuthorization(createReturnAuthorizationOptions, callback);
                },

                function (returnAuthorization, callback) {
                    var returnAuthorizationDao = new ReturnAuthorizationDao(context);
                    returnAuthorizationDao.receiveReturnAuthorization(returnAuthorization.id, function (error) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        context.models.Order.find(order.id).done(function (error, order) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            expect(order.state).to.equal('returned');
                            callback();
                        });
                    });
                }
            ], done);
        });
    });


    describe('cancelReturnAuthorization()', function () {
        it('should work', function (done) {
            var context,
                orderDao,
                order;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    createOrderOfUS(context, {doNotPay : false}, callback);
                },

                function (result, callback) {
                    order = result;
                    orderDao = new OrderDao(context);

                    context.models.Order.find(order.id).done(function (error, order) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        order.shipment_state = 'shipped';
                        order.payment_total = order.total;
                        order.payment_state = 'paid';
                        order.save().done(function (error) {
                            callback(error);
                        });
                    });
                },

                function (callback) {
                    var queryDatabaseOptions = {
                            sqlStmt : "update inventory_units set state = 'shipped' where order_id= $1",
                            sqlParams : [order.id]
                        };
                    DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                        callback(error);
                    });
                },

                function (callback) {
                    var createReturnAuthorizationOptions = {
                            orderId : order.id,
                            amount : 0.12,
                            reason : 'test',
                            lineItems : [
                                { variantId :  24, quantity : 1}
                            ]
                        };

                    orderDao.createReturnAuthorization(createReturnAuthorizationOptions, callback);
                },

                function (returnAuthorization, callback) {
                    var returnAuthorizationDao = new ReturnAuthorizationDao(context);
                    returnAuthorizationDao.cancelReturnAuthorization(returnAuthorization.id, function (error) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        context.models.Order.find(order.id).done(function (error, order) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            expect(order.state).to.equal('complete');
                            callback();
                        });
                    });
                }
            ], done);
        });
    });
});


/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var util = require('util');
var sidedoor = require('sidedoor');

var sutPath = '../../../lib/paymentMethods/creditcard.js';
var creditcardPaymentMethod = require(sutPath);
var privateAPIes = sidedoor.get(sutPath, 'privateAPIes');


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : true,
        database : true,
        user : true
    }, callback);
}


describe('lib/paymentMethods/creditcard', function () {
    describe('- getPaymentRequestData()', function () {
        it('Ipay', function (done) {
            var context,
                address = testUtil.getTestAddressData(),

                order = {
                    id : 123,
                    number : 'G00000000023',
                    total : 456.78,
                    billingAddress : address
                },

                creditcard = testUtil.getTestCreditcardInfoOfNormal(),

                payment = {
                    id : 234,
                    amount : 456.78,
                    payment_method_id : 1001,   // Ipay
                    creditcard : creditcard
                },

                requestDataExpected = {
                    'user-id' : null,
                    'order-id' : order.id,
                    'order-number' : 'G00000000023',
                    'payment-id' : payment.id,
                    'payment-method-id' : payment.payment_method_id,
                    'payment-amount' : payment.amount,
                    'order-amount' : order.total,
                    description : 'OG Order',
                    creditcard : {
                        number : creditcard.number,
                        'expiry-year' : creditcard.expiration_year,
                        'expiry-month' : creditcard.expiration_month,
                        'cvv' : creditcard.cvv
                    },
                    'billing-address' : {
                        'first-name' : address.firstname,
                        'last-name' : address.lastname,
                        street : address.address1,
                        'street-cont' : address.address2,
                        city : address.city,
                        zip : address.zipcode,
                        state : address.state.name,
                        'state-abbr' : address.state.abbr,
                        'country-iso' : address.country.iso,
                        phone : address.phone
                    },
                    'additional-payment-gateway-fields' : {
                        'distributor-id' : null,
                        'billing-address-country-iso3' : address.country.iso3
                    }
                };

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    order.user_id = context.user.userId;
                    requestDataExpected['user-id'] = order.user_id;
                    requestDataExpected['additional-payment-gateway-fields']['distributor-id'] = context.user.distributorId;

                    privateAPIes.getPaymentRequestData(context, order, payment, callback);
                },

                function (requestData, callback) {
                    expect(requestData).to.eql(requestDataExpected);

                    callback();
                }
            ], done);
        });


        it('Verify', function (done) {
            var context,
                address = testUtil.getTestAddressData(),

                order = {
                    id : 123,
                    number : 'G00000000023',
                    total : 456.78,
                    user : {
                        email : 'test@abc.com'
                    },
                    billingAddress : address,
                    shippingAddress : address,
                    shipping_method_id : 4,
                    lineItems : [
                        {
                            variant : {
                                sku : 101
                            }
                        },

                        {
                            variant : {
                                sku : 104
                            }
                        }
                    ]
                },

                creditcard = testUtil.getTestCreditcardInfoOfNormal(),

                payment = {
                    id : 234,
                    amount : 456.78,
                    payment_method_id : 3120,   // Verifi
                    creditcard : creditcard
                },

                requestDataExpected = {
                    'user-id' : null,
                    'order-id' : order.id,
                    'order-number' : 'G00000000023',
                    'payment-id' : payment.id,
                    'payment-method-id' : payment.payment_method_id,
                    'payment-amount' : payment.amount,
                    'order-amount' : order.total,
                    description : 'OG Order',
                    creditcard : {
                        number : creditcard.number,
                        'expiry-year' : creditcard.expiration_year,
                        'expiry-month' : creditcard.expiration_month,
                        'cvv' : creditcard.cvv
                    },
                    'billing-address' : {
                        'first-name' : address.firstname,
                        'last-name' : address.lastname,
                        street : address.address1,
                        'street-cont' : address.address2,
                        city : address.city,
                        zip : address.zipcode,
                        state : address.state.name,
                        'state-abbr' : address.state.abbr,
                        'country-iso' : address.country.iso,
                        phone : address.phone
                    },
                    'additional-payment-gateway-fields' : {
                        'distributor-id' : null,
                        'shipping-method-name' : 'US Ground',
                        'shipping-company' : 'Organo Gold',
                        'order-skus' : '101&104',
                        email : order.user.email,
                        ip : '',
                        'order-description' : 'OG Order',
                        'shipping-address' : {
                            company : 'Organo Gold',
                            'first-name' : address.firstname,
                            'last-name' : address.lastname,
                            street : address.address1,
                            'street-cont' : address.address2,
                            city : address.city,
                            zip : address.zipcode,
                            state : address.state.name,
                            'country-iso' : address.country.iso
                        }
                    }
                };

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    order.user_id = context.user.userId;
                    requestDataExpected['user-id'] = order.user_id;
                    requestDataExpected['additional-payment-gateway-fields']['distributor-id'] = context.user.distributorId;

                    privateAPIes.getPaymentRequestData(context, order, payment, callback);
                },

                function (requestData, callback) {
                    expect(requestData).to.eql(requestDataExpected);

                    callback();
                }
            ], done);
        });
    });
});


/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/order/post.js';
var handler = require(sutPath);

function getContext(callback) {
    testUtil.getContext({
        database : true,
        redis : true,
        user : true
    }, callback);
}

describe('handlers/v2/order', function () {
    describe('POST', function () {
        before(function () {
            mockery.enable();
            mockery.warnOnReplace(false);
            mockery.warnOnUnregistered(false);
        });

        after(function () {
            mockery.deregisterAll();
            mockery.disable();
        });

        it('should work', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    context.user.userId = 16087;
                    context.companyCode = 'WNP';

                    var request = {
                        get : function () {
                        },
                        context : context,
                        body : {
                            "payment-method-id": "3003",
                            "shipping-method-id": "5",
                            "shipping-address": {
                                "id": 77153,
                                "first-name": "Marina",
                                "m": "",
                                "last-name": "Mondrashina",
                                "phone": "9176135112",
                                "street": "Marina Clothing",
                                "street-cont": "2277 McDonald Ave",
                                "city": "Brooklyn",
                                "zip": "11223",
                                "state": "New York",
                                "state-id": 10048,
                                "country": "United States",
                                "country-id": 1214
                            },
                            "billing-address": {
                                "id": 77154,
                                "first-name": "Marina",
                                "m": "",
                                "last-name": "Mondrashina",
                                "phone": "9176135112",
                                "street": "Marina Clothing",
                                "street-cont": "2277 McDonald Ave",
                                "city": "Brooklyn",
                                "zip": "11223",
                                "state": "New York",
                                "state-id": 10048,
                                "country": "United States",
                                "country-id": 1214
                            },
                            "line-items": [
                                {
                                    "variant-id": "5",
                                    "quantity": 1,
                                    "catalog-code": null,
                                    "role-code": "D"
                                }
                            ],
                            "coupons": [],
                            "creditcard": {
                                "number": "4111111111111111",
                                "expiration-year": 2016,
                                "expiration-month": 4,
                                "cvv": "123"
                            }
                        }
                    };

                    handler(request, null, function (result) {
                        console.log(result.body);
                        expect(result.body).to.be.an('object');

                        callback();
                    });
                }
            ], done);
        });
    });
});

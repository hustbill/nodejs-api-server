/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/order/checkout/post.js';
var handler = require(sutPath);

function getContext(callback) {
    testUtil.getContext({
        database : true,
        redis : true,
        user : true
    }, callback);
}

describe('handlers/v2/order/checkout', function () {
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
                        context : context,
                        body : {
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
                            "line-items": [
                                {
                                    "variant-id": "5",
                                    "quantity": 1,
                                    "catalog-code": null,
                                    "role-code": "D"
                                }
                            ]
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

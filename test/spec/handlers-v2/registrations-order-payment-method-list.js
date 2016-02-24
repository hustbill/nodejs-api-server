/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/registrations/order/paymentMethod/list.js';
var handler = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        user : true
    }, callback);
}

describe('handlers/v2/registrations/orders/payment-methods', function () {
    describe('GET', function () {
        before(function () {
            mockery.enable();
            mockery.warnOnReplace(false);
            mockery.warnOnUnregistered(false);
        });

        after(function () {
            mockery.deregisterAll();
            mockery.disable();
        });

        it('should response payment methods available in country.', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            query : {
                                'country-id' : '1214'
                            }
                        };

                    handler(request, null, function (result) {
                        console.log(result);
                        expect(result.statusCode).to.equal(200);
                        expect(result.body).to.be.instanceof.Array;

                        callback();
                    });
                }
            ], done);
        });
    });
});

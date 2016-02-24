/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/registrations/order/purchaseAmountLimit/get.js';
var handler = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        user : true
    }, callback);
}

describe('handlers/v2/registrations/orders/purchase-amount-limit', function () {
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

        it('limit of default country', function (done) {
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
                        expect(result.statusCode).to.equal(200);
                        expect(result.body).to.eql({
                            limit : 2000
                        });

                        callback();
                    });
                }
            ], done);
        });

        it('should response error if country does not exist', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            query : {
                                'country-id' : '1'
                            }
                        };
                    handler(request, null, function (result) {
                        expect(result).to.be.instanceof(Error);
                        expect(result.statusCode).to.equal(404);

                        callback();
                    });
                }
            ], done);
        });
    });
});

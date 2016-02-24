/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/order/get.js';
var handler = require(sutPath);

function getContext(callback) {
    testUtil.getContext({
        emptyLogger : true,
        database : true,
        extend : {
            user : { userId :  13455}
        }
    }, callback);
}

describe('handlers/v2/order', function () {
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

        it('should work', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var orderId = 5899267,
                        request = {
                            params : {orderId : orderId},
                            context : context
                        };
                    handler(request, null, function (result) {
                        expect(result).to.be.an('object');
                        expect(result.body.id).to.equal(orderId);

                        callback();
                    });
                }
            ], done);
        });


        it('should deal with error properly', function (done) {
            mockery.registerMock('../../../daos/Order.js', function () {
                this.getOrderInfo = function (orderId, callback) {
                    expect(orderId).to.equal(456);
                    callback(new Error('query error'));
                };
            });

            async.waterfall([
                getContext,

                function (context, callback) {
                    var orderId = 456,
                        request = {
                            params : {orderId : orderId},
                            context : context
                        };
                    handler(request, null, function (error) {
                        expect(error).to.be.instanceof(Error);
                        expect(error.message).to.equal('query error');

                        callback();
                    });
                }
            ], done);
        });
    });
});

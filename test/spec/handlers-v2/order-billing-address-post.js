/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/order/addresses/billing/post.js';
var handler = require(sutPath);

function getContext(callback) {
    testUtil.getContext({
        extend : {
            user : { distributorId :  123}
        }
    }, callback);
}


function getContextOfCA(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        extend : {
            user : {
                distributorId : testUtil.getTestDistributorIdOfCA(),
                userId : testUtil.getTestUserIdOfCA(),
                login : testUtil.getTestLoginNameOfCA()
            }
        }
    }, callback);
}

describe('handlers/v2/order/address/billing', function () {
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
            mockery.registerMock('../../../daos/Order.js', function () {
                this.changeOrderBillingAddress = function (orderId, addressData, callback) {
                    expect(orderId).to.equal(456);
                    callback(null, addressData);
                };
            });

            async.waterfall([
                getContextOfCA,

                function (context, callback) {
                    var orderId = 456,
                        request = {
                            params : {orderId : orderId},
                            context : context,
                            body : {
                                city : 'Oakville',
                                country : 'Canada',
                                "country-id" : 1035,
                                "first-name" : 'Master',
                                "last-name" : 'Distributor',
                                m : 'm1',
                                phone : "888.845.3990",
                                state : 'Ontario',
                                "state-id" : 10009,
                                street : "100 Bel Air Drive",
                                "street-cont" : "",
                                zip : "L6J 7N1"
                            }
                        };
                    handler(request, null, function (result) {
                        expect(result).to.be.an('object');
                        console.log(result);

                        callback();
                    });
                }
            ], done);
        });


        it('should deal with error properly', function (done) {
            mockery.registerMock('../../../daos/Order.js', function () {
                this.changeOrderBillingAddress = function (orderId, addressData, callback) {
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
                            context : context,
                            body : {
                                city : 'Oakville',
                                country : 'Canada',
                                "country-id" : 1035,
                                "first-name" : 'Master',
                                "last-name" : 'Distributor',
                                m : 'm1',
                                phone : "888.845.3990",
                                state : 'Ontario',
                                "state-id" : 10009,
                                street : "100 Bel Air Drive",
                                "street-cont" : "",
                                zip : "L6J 7N1"
                            }
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

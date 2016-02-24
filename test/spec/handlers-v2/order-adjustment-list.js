/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/order/adjustment/list.js';
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

describe('handlers/v2/order/adjustment', function () {
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
                    var address = {
                            'first-name' : 'Mike',
                            'last-name' : 'Jim',
                            street : '111 Autumn Drive',
                            city : 'LANCASTER',
                            'country-id' : 1214,
                            'state-id' : 10049,
                            zip : '43130'
                        },
                        request = {
                            context : context,
                            body : {
                                'shipping-method-id' : 4,
                                'line-items' : [
                                    {
                                        'variant-id' : 2,
                                        quantity : 1
                                    },
                                    {
                                        'variant-id' : 5,
                                        quantity : 2
                                    }
                                ],
                                'shipping-address' : address,
                                'billing-address' : address
                            }
                        };

                    handler(request, null, function (result) {
                        console.log(result);
                        expect(result).to.be.an('object');
                        expect(result.statusCode).to.equal(200);
                        expect(result.body).to.be.instanceof(Array);

                        callback();
                    });
                }
            ], done);
        });


        it('should deal with error properly', function (done) {
            mockery.registerMock('../../../daos/Order.js', function () {
                this.getAdjustments = function (options, callback) {
                    callback(new Error('query error'));
                };
            });

            async.waterfall([
                getContext,

                function (context, callback) {
                    var address = {
                            'first-name' : 'Mike',
                            'last-name' : 'Jim',
                            street : '111 Autumn Drive',
                            city : 'LANCASTER',
                            'country-id' : 1214,
                            'state-id' : 10049,
                            zip : '43130'
                        },
                        request = {
                            context : context,
                            body : {
                                'shipping-method-id' : 4,
                                'line-items' : [
                                    {
                                        'variant-id' : 2,
                                        quantity : 1
                                    },
                                    {
                                        'variant-id' : 5,
                                        quantity : 2
                                    }
                                ],
                                'shipping-address' : address,
                                'billing-address' : address
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

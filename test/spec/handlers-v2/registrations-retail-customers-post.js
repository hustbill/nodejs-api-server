/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/registrations/retailCustomer/post.js';
var handler = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        redis : true,
        user : true
    }, callback);
}

describe('handlers/v2/registrations/retail-customers', function () {
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

        it('should create user and distributor and roles_users records.', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    context.user = null;

                    var tick = (new Date()).getTime(),
                        address = {
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
                                sponsor : '1001',
                                login : 'test-' + tick,
                                password : 'password123',
                                email : 'test-' + tick + '@test.com',
                                'shipping-address' : address
                            }
                        },
                        response = {
                            set : function () {}
                        };
                    handler(request, response, function (result) {
                        console.log(result);

                        expect(result).to.not.be.instanceof(Error);

                        callback();
                    });
                }
            ], done);
        });

        it('should callback RequestProcessing error if duplicate request was sent.', function (done) {
            mockery.enable();
            mockery.warnOnReplace(false);
            mockery.warnOnUnregistered(false);

            mockery.registerMock('../../../daos/Distributor', function (context) {
                this.context = context;
                this.getById = function (id, callback) {
                    this.context.readModels.Distributor.find(id).done(callback);
                };

                this.registerRetailCustomer = function (options, callback) {
                    console.log('mock: registering retail customer');
                    setTimeout(function () {
                        callback(new Error('register retail customer failed'));
                    }, 10000);
                };
            });

            async.waterfall([
                getContext,

                function (context, callback) {
                    context.user = null;

                    var tick = (new Date()).getTime(),
                        address = {
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
                                sponsor : '1007401',
                                login : 'test-' + tick,
                                password : 'password123',
                                email : 'test-' + tick + '@test.com',
                                'shipping-address' : address
                            }
                        },
                        response = {
                            set : function () {}
                        };

                    console.log('test: sending registration request...');
                    handler(request, response, function (result) {
                    });

                    setTimeout(function () {
                        console.log('test: re-sending registration request...');
                        handler(request, null, function (error) {
                            expect(error).to.be.instanceof(Error);
                            expect(error.errorCode).to.equal('RequestProcessing');

                            callback();
                        });
                    }, 5000);
                }
            ], function(error) {
                mockery.deregisterAll();
                mockery.disable();

                done(error);
            });
        });

        it('should also create order if line-items is provided.', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    context.user = null;

                    var tick = (new Date()).getTime(),
                        address = {
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
                                sponsor : '1001',
                                login : 'test-' + tick,
                                password : 'password123',
                                email : 'test-' + tick + '@test.com',
                                'home-address' : address,
                                'shipping-address' : address,
                                'billing-address' : address,
                                'line-items' : [
                                    {'variant-id': 12, quantity: 1, 'catalog-code': 'RG'}
                                ],
                                'shipping-method-id' : 4,
                                'payment-method-id' : 2
                            }
                        },
                        response = {
                            set : function () {}
                        };
                    handler(request, response, function (result) {
                        console.log(result);

                        expect(result).to.not.be.instanceof(Error);

                        callback();
                    });
                }
            ], done);
        });
    });
});

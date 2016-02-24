/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');
var random = require('../../../lib/random');

var sutPath = '../../../handlers/v2/registrations/post.js';
var handler = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        redis : true,
        user : true
    }, callback);
}

describe('handlers/v2/registrations', function () {
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
                        userInfo = {
                            'role-code' : 'D',
                            sponsor : '1007401',
                            login : 'test-' + tick,
                            password : 'password123',
                            email : 'test-' + tick + '@test.com',
                            'social-security-number' : random.text(9, random.seedNumbers),
                            'tax-id' : 'tax-' + tick,
                            'country-iso' : 'US'
                        },
                        address = {
                            'first-name' : 'Mike',
                            'last-name' : 'Jim',
                            street : '111 Autumn Drive',
                            city : 'LANCASTER',
                            'country-id' : 1214,
                            'state-id' : 10049,
                            zip : '43130'
                        },
                        creditcard = testUtil.getTestCreditcardInfoOfNormal(),
                        request = {
                            context : context,
                            body : {
                                'user-info' : userInfo,
                                'shipping-method-id' : 4,
                                'payment-method-id' : 3003,
                                'line-items' : [
                                    {
                                        'variant-id' : 24,
                                        quantity : 1
                                    },
                                    {
                                        'variant-id' : 34,
                                        quantity : 2
                                    }
                                ],
                                'home-address' : address,
                                'shipping-address' : address,
                                'billing-address' : address,
                                'website-address' : {
                                    'first-name' : 'Mike',
                                    'phone' : '13312345678',
                                    'email' : 'mike@abc.com'
                                },
                                creditcard : {
                                    number : creditcard.number,
                                    'expiration-year' : creditcard.year,
                                    'expiration-month' : creditcard.month,
                                    cvv : creditcard.cvv
                                }
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

        it('should create autoship if \'autoship-line-items\' was set.', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var tick = (new Date()).getTime(),
                        userInfo = {
                            'role-code' : 'D',
                            sponsor : '1007401',
                            login : 'test-' + tick,
                            password : 'password123',
                            email : 'test-' + tick + '@test.com',
                            'social-security-number' : random.text(9, random.seedNumbers),
                            'tax-id' : 'tax-' + tick,
                            'country-iso' : 'US'
                        },
                        address = {
                            'first-name' : 'Mike',
                            'last-name' : 'Jim',
                            street : '111 Autumn Drive',
                            city : 'LANCASTER',
                            'country-id' : 1214,
                            'state-id' : 10049,
                            zip : '43130'
                        },
                        creditcard = testUtil.getTestCreditcardInfoOfNormal(),
                        request = {
                            context : context,
                            body : {
                                'user-info' : userInfo,
                                'shipping-method-id' : 4,
                                'payment-method-id' : 3003,
                                'line-items' : [
                                    {
                                        'variant-id' : 24,
                                        quantity : 1
                                    },
                                    {
                                        'variant-id' : 34,
                                        quantity : 2
                                    }
                                ],
                                'autoship-line-items' : [
                                    {
                                        'variant-id' : 24,
                                        quantity : 2
                                    },
                                    {
                                        'variant-id' : 34,
                                        quantity : 3
                                    }
                                ],
                                'home-address' : address,
                                'shipping-address' : address,
                                'billing-address' : address,
                                'website-address' : {
                                    'first-name' : 'Mike',
                                    'phone' : '13312345678',
                                    'email' : 'mike@abc.com'
                                },
                                creditcard : {
                                    number : creditcard.number,
                                    'expiration-year' : creditcard.year,
                                    'expiration-month' : creditcard.month,
                                    cvv : creditcard.cvv
                                }
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

                this.registerDistributor = function (options, callback) {
                    console.log('mock: registering distributor');
                    setTimeout(function () {
                        callback(new Error('register distributor failed'));
                    }, 10000);
                };
            });

            async.waterfall([
                getContext,

                function (context, callback) {
                    context.user = null;

                    var tick = (new Date()).getTime(),
                        userInfo = {
                            'role-code' : 'D',
                            sponsor : '1007401',
                            login : 'test-' + tick,
                            password : 'password123',
                            email : 'test-' + tick + '@test.com',
                            'social-security-number' : 'social-security-number-' + tick,
                            'tax-id' : 'tax-' + tick,
                            'country-iso' : 'US'
                        },
                        address = {
                            'first-name' : 'Mike',
                            'last-name' : 'Jim',
                            street : '111 Autumn Drive',
                            city : 'LANCASTER',
                            'country-id' : 1214,
                            'state-id' : 10049,
                            zip : '43130'
                        },
                        creditcard = testUtil.getTestCreditcardInfoOfNormal(),
                        request = {
                            context : context,
                            body : {
                                'user-info' : userInfo,
                                'shipping-method-id' : 4,
                                'payment-method-id' : 3003,
                                'line-items' : [
                                    {
                                        'variant-id' : 24,
                                        quantity : 1
                                    },
                                    {
                                        'variant-id' : 34,
                                        quantity : 2
                                    }
                                ],
                                'home-address' : address,
                                'shipping-address' : address,
                                'billing-address' : address,
                                'website-address' : {
                                    'first-name' : 'Mike',
                                    'phone' : '13312345678',
                                    'email' : 'mike@abc.com'
                                },
                                creditcard : {
                                    number : creditcard.number,
                                    'expiration-year' : creditcard.year,
                                    'expiration-month' : creditcard.month,
                                    cvv : creditcard.cvv
                                }
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
    });

    describe('validateSponsorId()', function () {
        it('should work.', function (done) {

        });
    });

});

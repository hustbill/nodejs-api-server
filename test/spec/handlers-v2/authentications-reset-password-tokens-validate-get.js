/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/authentication/resetPasswordToken/validate/get.js';
var handler = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        user : true
    }, callback);
}

describe('/v2/authentications/reset-password-tokens/validate', function () {
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

        it('available', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            query : {
                                token : '123'
                            }
                        };

                    context.readModels = {
                        User : {
                            find : function (options) {
                                return {
                                    done : function (callback) {
                                        callback(null, {
                                            reset_password_token : '123',
                                            reset_password_sent_at : new Date()
                                        });
                                    }
                                };
                            }
                        }
                    };
                    handler(request, null, function (result) {
                        expect(result.body).to.eql({available : true});

                        callback();
                    });
                }
            ], done);
        });

        it('unavailable', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            query : {
                                token : '123'
                            }
                        };
                    handler(request, null, function (result) {
                        expect(result.body).to.eql({available : false});

                        callback();
                    });
                }
            ], done);
        });
    });
});

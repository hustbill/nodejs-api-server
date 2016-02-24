/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/registrations/availabilities/get.js';
var handler = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : true,
        database : true,
        user : true
    }, callback);
}

describe('handlers/v2/registrations/availabilities', function () {
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

        it('should response error if neither email nor login was provided.', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            query : {
                            }
                        };

                    handler(request, null, function (error) {
                        expect(error).to.be.instanceof(Error);
                        expect(error.statusCode).to.equal(400);

                        callback();
                    });
                }
            ], done);
        });

        it('check by email: available', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            query : {
                                email : 'test@test.com'
                            }
                        };
                    handler(request, null, function (result) {
                        expect(result.body).to.eql({
                            available : true
                        });

                        callback();
                    });
                }
            ], done);
        });

        it('check by email: unavailable', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            query : {
                                email : 'mark@getthesystem.com'
                            }
                        };
                    handler(request, null, function (result) {
                        expect(result.body).to.eql({
                            available : false
                        });

                        callback();
                    });
                }
            ], done);
        });

        it('check by login: available', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            query : {
                                login : 'asdfqwer123'
                            }
                        };
                    handler(request, null, function (result) {
                        expect(result.body).to.eql({
                            available : true
                        });

                        callback();
                    });
                }
            ], done);
        });

        it('check by login: unavailable', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            query : {
                                login : 'mseevers'
                            }
                        };
                    handler(request, null, function (result) {
                        expect(result.body).to.eql({
                            available : false
                        });

                        callback();
                    });
                }
            ], done);
        });

        it('check by ssn: available', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            query : {
                                ssn : 'asdfqwer123'
                            }
                        };
                    handler(request, null, function (result) {
                        expect(result.body).to.eql({
                            available : true
                        });

                        callback();
                    });
                }
            ], done);
        });

        it('check by ssn: unavailable', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            query : {
                                ssn : '311436224'
                            }
                        };
                    handler(request, null, function (result) {
                        expect(result.body).to.eql({
                            available : false
                        });

                        callback();
                    });
                }
            ], done);
        });

    });
});

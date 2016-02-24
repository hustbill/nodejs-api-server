/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/registrations/sponsor/get.js';
var handler = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : true,
        database : true,
        user : true
    }, callback);
}

describe('handlers/v2/registrations/sponsor/:distributorId', function () {
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

        it('should response name of given distributor if exists', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            params : {
                                distributorId : '1007401'
                            }
                        };
                    handler(request, null, function (result) {
                        expect(result.body).to.eql({
                            name : 'Mark Seevers'
                        });

                        callback();
                    });
                }
            ], done);
        });

        it('should response empty object if distributor does not exist', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            params : {
                                distributorId : '0'
                            }
                        };
                    handler(request, null, function (error) {
                        expect(error).to.be.instanceof(Error);
                        expect(error.errorCode).to.equal('SponsorNotFound');
                        expect(error.statusCode).to.equal(404);

                        callback();
                    });
                }
            ], done);
        });
    });
});

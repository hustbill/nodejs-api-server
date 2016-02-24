/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/address/website/validate.js';
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

describe('handlers/v2/address/website/validate', function () {
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
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            body : {
                                'first-name' : 'Mike',
                                'phone' : '13312345678',
                                'email' : 'mike@abc.com'
                            }
                        };
                    handler(request, null, function (result) {
                        expect(result).to.be.an('object');
                        expect(result.statusCode).to.equal(200);
                        expect(result.body.failures).to.be.instanceof(Array);
                        expect(result.body.failures.length).to.equal(0);

                        callback();
                    });
                }
            ], done);
        });


        it('should response failures if it happened', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            body : {
                                'first-name' : '',
                                'phone' : '13312345678',
                                'email' : 'mike@abc.com'
                            }
                        };
                    handler(request, null, function (result) {
                        expect(result).to.be.an('object');
                        expect(result.statusCode).to.equal(200);
                        expect(result.body.failures).to.be.instanceof(Array);
                        expect(result.body.failures.length).to.equal(1);

                        var failure = result.body.failures[0];
                        expect(failure.field).to.equal('first-name');
                        expect(failure.code).to.equal('InvalidFirstName');

                        callback();
                    });
                }
            ], done);
        });
    });
});

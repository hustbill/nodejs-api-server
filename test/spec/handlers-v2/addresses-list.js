/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/address/list.js';
var handler = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : true,
        database : true,
        user : true
    }, callback);
}

describe('handlers/v2/address/list', function () {
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
                            query : {}
                        };
                    handler(request, null, function (result) {
                        expect(result).to.be.an('object');
                        expect(result.body.home).to.be.an('object');
                        expect(result.body.billing).to.be.an('object');
                        expect(result.body.shipping).to.be.an('object');
                        expect(result.body.website).to.be.an('object');

                        console.log(result);

                        callback();
                    });
                }
            ], done);
        });
    });
});

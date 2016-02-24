/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/profile/get.js';
var handler = require(sutPath);

function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        user : true
    }, callback);
}

describe('handlers/v2/profile', function () {
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
                    var request = {
                            context : context
                        };
                    handler(request, null, function (result) {
                        expect(result).to.be.an('object');

                        var localization = result.body.localization;
                        console.log(JSON.stringify(result.body), '-----');
                        expect(localization).to.eql({
                            'country-id': 1214,
                            'country-iso' : 'US',
                            'currency-code' : 'USD',
                            'currency-symbol' : '$'
                        });

                        expect(result.body).to.have.property('next-renewal-date');
                        expect(result.body).to.have.property('special-distributor-next-renewal-date');

                        callback();
                    });
                }
            ], done);
        });
    });
});

/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/registrations/licenseAgreement/get.js';
var handler = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        user : true
    }, callback);
}

describe('handlers/v2/registrations/license-agreements', function () {
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

        it('should response contents of license agreement.', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var request = {
                            context : context,
                            get : function (key) {
                                var headers = {
                                        'accept-language' : 'en-US,en;q=0.8,zh-CN;q=0.5,zh;q=0.3'
                                    };

                                return headers[key.toLowerCase()];
                            }
                        };

                    handler(request, null, function (result) {
                        console.log(result);
                        expect(result.statusCode).to.equal(200);
                        expect(result.body.text).to.be.string;

                        callback();
                    });
                }
            ], done);
        });
    });
});

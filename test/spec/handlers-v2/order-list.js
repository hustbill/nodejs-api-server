/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/order/list.js';
var handler = require(sutPath);

function getContext(callback) {
    testUtil.getContext({
        database : true,
        extend : {
            user : { userId :  11331}
        }
    }, callback);
}

describe('handlers/v2/order/list', function () {
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
                            query : {offset : 0, limit : 2},
                            context : context
                        };
                    handler(request, null, function (result) {
                        expect(result).to.be.an('object');
                        console.log(result);

                        callback();
                    });
                }
            ], done);
        });
    });
});

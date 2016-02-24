/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');

var suitPath = '../../../lib/cacheHelper.js';
var cache = require(suitPath);


function getContext(callback) {
    testUtil.getContext({
        memcached : true
    }, callback);
}

describe('lib/cacheHelper', function () {
    describe('set()', function () {
        it('should store {key, value} into cache', function (done) {
            var context,
                key = 'foo',
                value = {
                    foo : 'foo',
                    bar : new Date()
                },
                ttl = 0;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;
                    cache.set(context, key, value, ttl, callback);
                },

                function (callback) {
                    cache.get(context, key, callback);
                },

                function (result, callback) {
                    expect(result).to.eql(value);
                    callback();
                }
            ], done);
        });
    });


    describe('del()', function () {
        it('should delete {key, value} from cache', function (done) {
            var context,
                key = 'foo',
                value = {
                    foo : 'foo',
                    bar : new Date()
                },
                ttl = 0;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;
                    cache.set(context, key, value, ttl, callback);
                },

                function (callback) {
                    cache.del(context, key, callback);
                },

                function (callback) {
                    cache.get(context, key, callback);
                },

                function (result, callback) {
                    expect(result).not.be.ok;
                    callback();
                }
            ], done);
        });
    });
});

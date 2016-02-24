var YUITest = require('yuitest').YUITest;
var mockery = require('mockery');

var Assert = YUITest.Assert;
var sutPath = '../../../handlers/recentSignups.js';

YUITest.TestRunner.add(new YUITest.TestCase({
    name : 'recentSignups',

    setUp : function () {
        mockery.enable();
        mockery.registerAllowable('async');
        mockery.registerAllowable('crypto');
        mockery.registerAllowable('./constant');
        mockery.registerAllowable('../../lib/utils.js');
        mockery.registerAllowable(sutPath, true);

        this.request = {
            context : {
                logger : {
                    trace : function () {
                        console.log.apply(console, arguments);
                    }
                },
                user : { distributorId : 123 },
                readDatabaseClient : { },
                memcachedClient : {}
            }
        };

        this.response = {
        };
    },

    tearDown : function () {
        mockery.deregisterAll();
        mockery.disable();
    },

    testLoadRecentSignupsQueryError : function () {
        var handler = require(sutPath),
            self = this;

        this.request.context.user.distributorId = 888;
        this.request.context.readDatabaseClient.query = function (sql, values, cb) {
            Assert.areSame(values[0], 888);

            // Wrap all async call into process.nextTick();
            process.nextTick(function () {
                cb(new Error('query error'));
            });
        };

        this.request.context.memcachedClient.get = function (key, cb) {
            process.nextTick(function () {
                cb(null, false);
            });
        };

        handler(this.request, this.response, function (error) {
            self.resume(function () {
                Assert.isInstanceOf(Error, error);
                Assert.areSame(error.message, 'query error');
                Assert.areSame(error.statusCode, 500);
            });
        });

        this.wait();
    }

}));



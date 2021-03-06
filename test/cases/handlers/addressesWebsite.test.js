var YUITest = require('yuitest').YUITest;
var mockery = require('mockery');

var Assert = YUITest.Assert;
var sutPath = '../../../handlers/addressesWebsite.js';

YUITest.TestRunner.add(new YUITest.TestCase({
    name : 'addressesWebsite',

    setUp : function () {
        mockery.enable();
        mockery.registerAllowable('async');
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

        this.request.context.memcachedClient.get = function (key, cb) {
            Assert.areSame(key, 'WebsiteAddress_123');

            process.nextTick(function () {
                cb(null, false);
            });
        };

        this.request.context.memcachedClient.set = function (key, value, timeoutSeconds, cb) {
            Assert.areSame(key, 'WebsiteAddress_123');

            process.nextTick(function () {
                cb(null);
            });
        };

        this.response = {
        };
    },

    tearDown : function () {
        mockery.deregisterAll();
        mockery.disable();
    },

    testLoadAddressesWebsiteQueryError : function () {
        var handler = require(sutPath),
            self = this;

        this.request.context.readDatabaseClient.query = function (sql, values, cb) {
            Assert.areSame(values[0], 123);

            // Wrap all async call into process.nextTick();
            process.nextTick(function () {
                cb(new Error('query error'));
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
    },

    testLoadAddressesWebsiteQuerySuccess : function () {
        var handler = require(sutPath),
            self = this,
            dbResult = {
                rows : [
                    {
                        first_name : 'Chao',
                        middle_abbr : 'S',
                        last_name : 'Shen',
                        phone : '1234567890',
                        email : 'test@domain.com',
                        mobile : '1234567890',
                        fax_number : '1234567890'
                    }
                ]
            },
            responseBodyMap = {
                FirstName: 'first_name',
                M: 'middle_abbr',
                LastName: 'last_name',
                Phone: 'phone',
                Email: 'email',
                Mobile: 'mobile',
                Fax: 'fax_number'
            };

        this.request.context.readDatabaseClient.query = function (sql, values, cb) {
            Assert.areSame(values[0], 123);

            process.nextTick(function () {
                cb(null, dbResult);
            });
        };


        handler(this.request, this.response, function (result) {
            self.resume(function () {
                Assert.isInstanceOf(Object, result);
                Assert.areSame(result.statusCode, 200);

                Object.keys(responseBodyMap).forEach(function (key) {
                    Assert.areSame(result.body[key], dbResult.rows[0][responseBodyMap[key]]);
                });
            });
        });

        this.wait();
    }

}));



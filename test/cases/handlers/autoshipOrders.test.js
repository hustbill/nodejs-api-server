var YUITest = require('yuitest').YUITest;
var mockery = require('mockery');

var Assert = YUITest.Assert;
var sutPath = '../../../handlers/autoshipOrders.js';

YUITest.TestRunner.add(new YUITest.TestCase({
    name : 'autoshipOrders',

    setUp : function () {
        mockery.enable();
        mockery.registerAllowable('async');
        mockery.registerAllowable('../../lib/constants.js');
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
            Assert.areSame(key, 'AutoshipOrders_123');

            process.nextTick(function () {
                cb(null, false);
            });
        };

        this.request.context.memcachedClient.set = function (key, value, timeoutSeconds, cb) {
            Assert.areSame(key, 'AutoshipOrders_123');

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

    testLoadAutoshipOrdersQueryError : function () {
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

    testLoadAutoshipOrdersQuerySuccess : function () {
        var handler = require(sutPath),
            self = this,
            dbResult = {
                rows : [
                    {
                        state : 'complete',
                        order_date : '2012-11-02 12:00:00',
                        autoship_date : '2012-11-06 12:00:00',
                        autoship_start_date : '2012-11-06 12:00:00',
                        qualification_vol : 12,
                        commission_volume : 21,
                        total_price : 67
                    },
                    {
                        state : 'complete',
                        order_date : '2012-11-02 12:00:00',
                        autoship_date : '2012-11-06 12:00:00',
                        autoship_start_date : '2012-11-06 12:00:00',
                        qualification_vol : 12,
                        commission_volume : 21,
                        total_price : 67
                    }
                ]
            },
            responseBodyMap = {
                OrderDate : 'order_date',
                AutoshipDate : 'autoship_date',
                StartDate : 'autoship_start_date',
                QualificationVol : 'qualification_vol',
                CommissionVol : 'commission_volume',
                TotalPrice : 'total_price'
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

                Assert.isInstanceOf(Array, result.body);
                result.body.forEach(function (order) {
                    Assert.areSame(order.Status, 'Active');
                    Object.keys(responseBodyMap).forEach(function (key) {
                        Assert.areSame(order[key], dbResult.rows[0][responseBodyMap[key]]);
                    });
                });
            });
        });

        this.wait();
    }

}));



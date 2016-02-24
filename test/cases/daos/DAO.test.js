var YUITest = require('yuitest').YUITest;
var mockery = require('mockery');
var util = require('util');
var FakeModel = require('../../fakeModel');

var Assert = YUITest.Assert;
var sutPath = '../../../daos/DAO.js';
var DAO = require(sutPath);

YUITest.TestRunner.add(new YUITest.TestCase({
    name : 'daos/DAO',

    setUp : function () {
        mockery.enable();
        mockery.registerAllowable('async');
        mockery.registerAllowable('../../lib/utils.js');
        mockery.registerAllowable(sutPath, true);

        var consoleLogTarget = function () {
            console.log.apply(console, arguments);
        };

        this.context = {
            logger : {
                trace : consoleLogTarget,
                info : consoleLogTarget,
                warn : consoleLogTarget,
                error : consoleLogTarget
            }
        };
    },

    tearDown : function () {
        mockery.deregisterAll();
        mockery.disable();
    },

    testGetByIdSuccess : function () {
        // the test FooDao class
        function Foo(context) {
            DAO.call(this, context);
        }
        util.inherits(Foo, DAO);

        var self = this,
            dbResult = {
                bar : 23
            },
            context = {
                logger : this.context.logger,
                readModels : {
                    Foo : new FakeModel({
                        modelName : 'Foo',
                        findResult : dbResult
                    })
                }
            },
            foo = new Foo(context);

        foo.getById('23', function (error, result) {
            self.resume(function () {
                Assert.isNull(error);
                Assert.areSame(dbResult, result);
            });
        });

        this.wait();
    },

    testGetByIdFindNothing : function () {
        // the test FooDao class
        function Foo(context) {
            DAO.call(this, context);
        }
        util.inherits(Foo, DAO);

        var self = this,
            context = {
                logger : this.context.logger,
                readModels : {
                    Foo : new FakeModel({
                        modelName : 'Foo',
                        findResult : null
                    })
                }
            },
            foo = new Foo(context);

        foo.getById('23', function (error, result) {
            self.resume(function () {
                Assert.isNotNull(error);
                Assert.areSame('Cannot find Foo with id: 23', error.message);
            });
        });

        this.wait();
    },

    testGetByIdFindError : function () {
        // the test FooDao class
        function Foo(context) {
            DAO.call(this, context);
        }
        util.inherits(Foo, DAO);

        var self = this,
            errorMessage = 'Error when find model',
            context = {
                logger : this.context.logger,
                readModels : {
                    Foo : new FakeModel({
                        modelName : 'Foo',
                        errorOnFind : new Error(errorMessage)
                    })
                }
            },
            foo = new Foo(context);

        foo.getById('23', function (error, result) {
            self.resume(function () {
                Assert.isNotNull(error);
                Assert.areSame(errorMessage, error.message);
            });
        });

        this.wait();
    },

    testQueryDatabaseSuccess : function () {
        var self = this,
            sqlStmtToQuery = 'SELECT * FROM mobile.get_profile_info($1)',
            sqlParamsToQuery = [23],
            dbResult = [1, 2, 3],
            context = {
                logger : this.context.logger,
                readDatabaseClient : {}
            },
            dao = new DAO(context),
            queryDatabaseOptions = {
                sqlStmt : sqlStmtToQuery,
                sqlParams : sqlParamsToQuery
            };

        context.readDatabaseClient.query = function (sqlStmt, sqlParams, callback) {
            Assert.areSame(sqlStmtToQuery, sqlStmt);
            Assert.areSame(sqlParamsToQuery, sqlParams);

            process.nextTick(function () {
                callback(null, dbResult);
            });
        };

        dao.queryDatabase(queryDatabaseOptions, function (error, result) {
            self.resume(function () {
                Assert.isNull(error);
                Assert.areSame(dbResult, result);
            });
        });

        this.wait();
    },

    testQueryDatabaseError : function () {
        var self = this,
            sqlStmtToQuery = 'SELECT * FROM mobile.get_profile_info($1)',
            sqlParamsToQuery = [23],
            errorMessage = 'Error when query database',
            context = {
                logger : this.context.logger,
                readDatabaseClient : {}
            },
            dao = new DAO(context),
            queryDatabaseOptions = {
                sqlStmt : sqlStmtToQuery,
                sqlParams : sqlParamsToQuery
            };

        context.readDatabaseClient.query = function (sqlStmt, sqlParams, callback) {
            Assert.areSame(sqlStmtToQuery, sqlStmt);
            Assert.areSame(sqlParamsToQuery, sqlParams);

            process.nextTick(function () {
                callback(new Error(errorMessage));
            });
        };

        dao.queryDatabase(queryDatabaseOptions, function (error, result) {
            self.resume(function () {
                Assert.isNotNull(error);
                Assert.areSame(errorMessage, error.message);

                Assert.isUndefined(result);
            });
        });

        this.wait();
    },

    testQueryDatabaseUsingWriteDatabase : function () {
        var self = this,
            sqlStmtToQuery = 'SELECT * FROM mobile.get_profile_info($1)',
            sqlParamsToQuery = [23],
            dbResult = [1, 2, 3],
            context = {
                logger : this.context.logger,
                databaseClient : {},
                readDatabaseClient : {}
            },
            dao = new DAO(context),
            queryDatabaseOptions = {
                useWriteDatabase : true,
                sqlStmt : sqlStmtToQuery,
                sqlParams : sqlParamsToQuery
            };

        context.databaseClient.query = function (sqlStmt, sqlParams, callback) {
            Assert.areSame(sqlStmtToQuery, sqlStmt);
            Assert.areSame(sqlParamsToQuery, sqlParams);

            process.nextTick(function () {
                callback(null, dbResult);
            });
        };

        context.readDatabaseClient.query = function (sqlStmt, sqlParams, callback) {
            process.nextTick(function () {
                callback(new Error('Should not query read database if `useWriteDatabase` options is set as true'));
            });
        };

        dao.queryDatabase(queryDatabaseOptions, function (error, result) {
            self.resume(function () {
                Assert.isNull(error);
                Assert.areSame(dbResult, result);
            });
        });

        this.wait();
    },

    testQueryDatabaseWhenCacheIsAvailable : function () {
        var self = this,
            sqlStmtToQuery = 'SELECT * FROM mobile.get_profile_info($1)',
            sqlParamsToQuery = [23],
            cacheKey = 'key_23',
            cacheResultJSON = '23',
            context = {
                logger : this.context.logger,
                memcachedClient : {},
                readDatabaseClient : {}
            },
            dao = new DAO(context),
            queryDatabaseOptions = {
                cache : {
                    key : cacheKey
                },
                sqlStmt : sqlStmtToQuery,
                sqlParams : sqlParamsToQuery
            };

        context.memcachedClient.get = function (key, callback) {
            Assert.areSame(cacheKey, key);

            process.nextTick(function () {
                callback(null, cacheResultJSON);
            });
        };

        context.readDatabaseClient.query = function (sqlStmt, sqlParams, callback) {
            process.nextTick(function () {
                callback(new Error('Should not read database if cache result is available'));
            });
        };

        dao.queryDatabase(queryDatabaseOptions, function (error, result) {
            self.resume(function () {
                Assert.isNull(error);

                Assert.areSame(JSON.parse(cacheResultJSON), result);
            });
        });

        this.wait();
    },

    testQueryDatabaseWhenCacheIsUnavailable : function () {
        var self = this,
            sqlStmtToQuery = 'SELECT * FROM mobile.get_profile_info($1)',
            sqlParamsToQuery = [23],
            dbResult = [1, 2, 3],
            cacheKey = 'key_23',
            cacheTtl = 60,
            cacheValue = null,
            context = {
                logger : this.context.logger,
                memcachedClient : {},
                readDatabaseClient : {}
            },
            dao = new DAO(context),
            queryDatabaseOptions = {
                cache : {
                    key : cacheKey,
                    ttl : cacheTtl
                },
                sqlStmt : sqlStmtToQuery,
                sqlParams : sqlParamsToQuery
            };

        context.memcachedClient.get = function (key, callback) {
            Assert.areSame(cacheKey, key);

            process.nextTick(function () {
                callback(new Error());
            });
        };

        context.memcachedClient.set = function (key, value, ttl, callback) {
            Assert.areSame(cacheKey, key);
            Assert.areSame(JSON.stringify(dbResult), value);
            Assert.areSame(cacheTtl, ttl);

            process.nextTick(function () {
                cacheValue = value;
                callback();
            });
        };

        context.readDatabaseClient.query = function (sqlStmt, sqlParams, callback) {
            Assert.areSame(sqlStmtToQuery, sqlStmt);
            Assert.areSame(sqlParamsToQuery, sqlParams);

            process.nextTick(function () {
                callback(null, dbResult);
            });
        };

        dao.queryDatabase(queryDatabaseOptions, function (error, result) {
            self.resume(function () {
                Assert.isNull(error);

                Assert.areSame(dbResult, result);
                Assert.areSame(JSON.stringify(dbResult), cacheValue);
            });
        });

        this.wait();
    }
}));



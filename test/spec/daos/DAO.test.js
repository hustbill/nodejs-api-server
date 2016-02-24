/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var FakeModel = require('../../fakeModel');
var util = require('util');

var sutPath = '../../../daos/DAO.js';
var DAO = require(sutPath);


function getTestDaoClass() {
    // the test FooDao class
    function Foo(context) {
        DAO.call(this, context);
    }
    util.inherits(Foo, DAO);

    return Foo;
}


describe('daos/DAO', function () {
    describe('getById()', function () {
        it('should work', function (done) {
            var dbResult = {
                    bar : 23
                };

            async.waterfall([
                function (callback) {
                    testUtil.getContext({
                        extend : {
                            readModels : {
                                Foo : new FakeModel({
                                    modelName : 'Foo',
                                    findResult : dbResult
                                })
                            }
                        }
                    }, callback);
                },

                function (context, callback) {
                    var Foo = getTestDaoClass(),
                        foo = new Foo(context);

                    foo.getById(23, function (error, result) {
                        expect(error).to.not.be.ok;
                        expect(result).to.equal(dbResult);
                        callback();
                    });
                }
            ], done);
        });


        it('should callback error if record with id does\'nt exist.', function (done) {
            async.waterfall([
                function (callback) {
                    testUtil.getContext({
                        extend : {
                            readModels : {
                                Foo : new FakeModel({
                                    modelName : 'Foo',
                                    findResult : null
                                })
                            }
                        }
                    }, callback);
                },

                function (context, callback) {
                    var Foo = getTestDaoClass(),
                        foo = new Foo(context);

                    foo.getById(23, function (error, result) {
                        expect(error).to.be.ok;
                        expect(error.message).to.equal('Cannot find Foo with id: 23');
                        expect(error.errorCode).to.equal('FooNotFound');
                        callback();
                    });
                }
            ], done);
        });


        it('should callback error if passed an empty id.', function (done) {
            var dbResult = {
                    bar : 23
                };

            async.waterfall([
                function (callback) {
                    testUtil.getContext({
                        extend : {
                            readModels : {
                                Foo : new FakeModel({
                                    modelName : 'Foo',
                                    findResult : dbResult
                                })
                            }
                        }
                    }, callback);
                },

                function (context, callback) {
                    var Foo = getTestDaoClass(),
                        foo = new Foo(context);

                    foo.getById(0, function (error, result) {
                        expect(error).to.be.ok;
                        expect(error.message).to.equal('Cannot find Foo with id: 0');
                        expect(error.errorCode).to.equal('FooNotFound');
                        callback();
                    });
                }
            ], done);
        });


        it('should callback error if id is not a number.', function (done) {
            var dbResult = {
                    bar : 23
                };

            async.waterfall([
                function (callback) {
                    testUtil.getContext({
                        extend : {
                            readModels : {
                                Foo : new FakeModel({
                                    modelName : 'Foo',
                                    findResult : dbResult
                                })
                            }
                        }
                    }, callback);
                },

                function (context, callback) {
                    var Foo = getTestDaoClass(),
                        foo = new Foo(context);

                    foo.getById('123', function (error, result) {
                        expect(error).to.be.ok;
                        expect(error.message).to.equal('Cannot find Foo with id: 123');
                        expect(error.errorCode).to.equal('FooNotFound');
                        callback();
                    });
                }
            ], done);
        });


        it('should callback error if id is not an integer.', function (done) {
            var dbResult = {
                    bar : 23
                };

            async.waterfall([
                function (callback) {
                    testUtil.getContext({
                        extend : {
                            readModels : {
                                Foo : new FakeModel({
                                    modelName : 'Foo',
                                    findResult : dbResult
                                })
                            }
                        }
                    }, callback);
                },

                function (context, callback) {
                    var Foo = getTestDaoClass(),
                        foo = new Foo(context);

                    foo.getById(12.3, function (error, result) {
                        expect(error).to.be.ok;
                        expect(error.message).to.equal('Cannot find Foo with id: 12.3');
                        expect(error.errorCode).to.equal('FooNotFound');
                        callback();
                    });
                }
            ], done);
        });


        it('should callback error if error happend.', function (done) {
            var errorMessage = 'Error when find model';

            async.waterfall([
                function (callback) {
                    testUtil.getContext({
                        extend : {
                            readModels : {
                                Foo : new FakeModel({
                                    modelName : 'Foo',
                                    errorOnFind : new Error(errorMessage)
                                })
                            }
                        }
                    }, callback);
                },

                function (context, callback) {
                    var Foo = getTestDaoClass(),
                        foo = new Foo(context);

                    foo.getById(23, function (error, result) {
                        expect(error).to.be.ok;
                        expect(error.message).to.equal(errorMessage);
                        callback();
                    });
                }
            ], done);
        });
    });


    describe('queryDatabase()', function () {
        it('should work', function (done) {
            var sqlStmtToQuery = 'SELECT * FROM mobile.get_profile_info($1)',
                sqlParamsToQuery = [23],
                dbResult = [1, 2, 3];

            async.waterfall([
                function (callback) {
                    testUtil.getContext({
                        extend : {
                            readDatabaseClient : {
                                query : function (sqlStmt, sqlParams, callback) {
                                    expect(sqlStmt).to.equal(sqlStmtToQuery);
                                    expect(sqlParams).to.equal(sqlParamsToQuery);

                                    process.nextTick(function () {
                                        callback(null, dbResult);
                                    });
                                }
                            }
                        }
                    }, callback);
                },

                function (context, callback) {
                    var dao = new DAO(context),
                        queryDatabaseOptions = {
                            sqlStmt : sqlStmtToQuery,
                            sqlParams : sqlParamsToQuery
                        };

                    dao.queryDatabase(queryDatabaseOptions, function (error, result) {
                        expect(error).to.not.be.ok;
                        expect(result).to.equal(dbResult);

                        callback();
                    });
                }
            ], done);
        });


        it('should callback error if error happend', function (done) {
            var sqlStmtToQuery = 'SELECT * FROM mobile.get_profile_info($1)',
                sqlParamsToQuery = [23],
                errorMessage = 'Error when query database';

            async.waterfall([
                function (callback) {
                    testUtil.getContext({
                        extend : {
                            databaseClient : {
                                query : function (sqlStmt, sqlParams, callback) {
                                    process.nextTick(function () {
                                        callback(new Error('should not use databaseClient'));
                                    });
                                }
                            },

                            readDatabaseClient : {
                                query : function (sqlStmt, sqlParams, callback) {
                                    expect(sqlStmt).to.equal(sqlStmtToQuery);
                                    expect(sqlParams).to.equal(sqlParamsToQuery);

                                    process.nextTick(function () {
                                        callback(new Error(errorMessage));
                                    });
                                }
                            }
                        }
                    }, callback);
                },

                function (context, callback) {
                    var dao = new DAO(context),
                        queryDatabaseOptions = {
                            sqlStmt : sqlStmtToQuery,
                            sqlParams : sqlParamsToQuery
                        };

                    dao.queryDatabase(queryDatabaseOptions, function (error, result) {
                        expect(error).to.be.ok;
                        expect(error.message).to.equal(errorMessage);
                        expect(result).to.equal(undefined);

                        callback();
                    });
                }
            ], done);
        });


        it('should use databaseClient instead of readDatabaseClient if useWriteDatabase option is true', function (done) {
            var sqlStmtToQuery = 'SELECT * FROM mobile.get_profile_info($1)',
                sqlParamsToQuery = [23],
                dbResult = [1, 2, 3];

            async.waterfall([
                function (callback) {
                    testUtil.getContext({
                        extend : {
                            databaseClient : {
                                query : function (sqlStmt, sqlParams, callback) {
                                    expect(sqlStmt).to.equal(sqlStmtToQuery);
                                    expect(sqlParams).to.equal(sqlParamsToQuery);

                                    process.nextTick(function () {
                                        callback(null, dbResult);
                                    });
                                }
                            },

                            readDatabaseClient : {
                                query : function (sqlStmt, sqlParams, callback) {
                                    process.nextTick(function () {
                                        callback(new Error('should not use readDatabaseClient'));
                                    });
                                }
                            }
                        }
                    }, callback);
                },

                function (context, callback) {
                    var dao = new DAO(context),
                        queryDatabaseOptions = {
                            useWriteDatabase : true,
                            sqlStmt : sqlStmtToQuery,
                            sqlParams : sqlParamsToQuery
                        };

                    dao.queryDatabase(queryDatabaseOptions, function (error, result) {
                        expect(error).to.not.be.ok;
                        expect(result).to.equal(dbResult);

                        callback();
                    });
                }
            ], done);
        });


        it('should not read database if cache result is available', function (done) {
            var sqlStmtToQuery = 'SELECT * FROM mobile.get_profile_info($1)',
                sqlParamsToQuery = [23],
                cacheKey = 'key_23',
                cacheResultJSON = '[1, 2, 3]';

            async.waterfall([
                function (callback) {
                    testUtil.getContext({
                        extend : {
                            memcachedClient : {
                                get : function (key, callback) {
                                    expect(key).to.equal(cacheKey);

                                    process.nextTick(function () {
                                        callback(null, cacheResultJSON);
                                    });
                                }
                            },

                            databaseClient : {
                                query : function (sqlStmt, sqlParams, callback) {
                                    process.nextTick(function () {
                                        callback(new Error('should not use databaseClient'));
                                    });
                                }
                            },

                            readDatabaseClient : {
                                query : function (sqlStmt, sqlParams, callback) {
                                    process.nextTick(function () {
                                        callback(new Error('should not use readDatabaseClient'));
                                    });
                                }
                            }
                        }
                    }, callback);
                },

                function (context, callback) {
                    var dao = new DAO(context),
                        queryDatabaseOptions = {
                            cache : {
                                key : cacheKey
                            },
                            useWriteDatabase : true,
                            sqlStmt : sqlStmtToQuery,
                            sqlParams : sqlParamsToQuery
                        };

                    dao.queryDatabase(queryDatabaseOptions, function (error, result) {
                        expect(error).to.not.be.ok;
                        expect(result).to.eql(JSON.parse(cacheResultJSON));

                        callback();
                    });
                }
            ], done);
        });


        it('should not fail when cache is unavailable', function (done) {
            var sqlStmtToQuery = 'SELECT * FROM mobile.get_profile_info($1)',
                sqlParamsToQuery = [23],
                dbResult = [1, 2, 3],
                cacheKey = 'key_23',
                cacheTtl = 60,
                cacheValue = null;

            async.waterfall([
                function (callback) {
                    testUtil.getContext({
                        extend : {
                            memcachedClient : {
                                get : function (key, callback) {
                                    expect(key).to.equal(cacheKey);

                                    process.nextTick(function () {
                                        callback(new Error('Cache is unavailable'));
                                    });
                                },

                                set : function (key, value, ttl, callback) {
                                    expect(key).to.equal(cacheKey);
                                    expect(value).to.equal(JSON.stringify(dbResult));
                                    expect(ttl).to.equal(cacheTtl);

                                    process.nextTick(function () {
                                        cacheValue = value;
                                        callback();
                                    });
                                }
                            },

                            databaseClient : {
                                query : function (sqlStmt, sqlParams, callback) {
                                    process.nextTick(function () {
                                        callback(new Error('should not use databaseClient'));
                                    });
                                }
                            },

                            readDatabaseClient : {
                                query : function (sqlStmt, sqlParams, callback) {
                                    expect(sqlStmt).to.equal(sqlStmtToQuery);
                                    expect(sqlParams).to.equal(sqlParamsToQuery);

                                    process.nextTick(function () {
                                        callback(null, dbResult);
                                    });
                                }
                            }
                        }
                    }, callback);
                },

                function (context, callback) {
                    var dao = new DAO(context),
                        queryDatabaseOptions = {
                            cache : {
                                key : cacheKey,
                                ttl : cacheTtl
                            },
                            sqlStmt : sqlStmtToQuery,
                            sqlParams : sqlParamsToQuery
                        };

                    dao.queryDatabase(queryDatabaseOptions, function (error, result) {
                        expect(error).to.not.be.ok;
                        expect(result).to.eql(dbResult);
                        expect(cacheValue).to.equal(JSON.stringify(dbResult));

                        callback();
                    });
                }
            ], done);
        });
    });
});


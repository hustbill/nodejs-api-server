/**
 * Base DAO class.
 */

var assert = require('assert');
var async = require('async');
var cacheHelper = require('../lib/cacheHelper');


function DAO(context) {
    assert(typeof context === 'object', 'context must be a valid object.');

    this.context = context;
    this.logger = this.context.logger;
    this.memcachedClient = this.context.memcachedClient;

    this.databaseClient = this.context.databaseClient;
    this.readDatabaseClient = this.context.readDatabaseClient;

    this.sequelize = this.context.sequelize;
    this.models = this.context.models;

    this.readSequelize = this.context.readSequelize;
    this.readModels = this.context.readModels;
}

/**
 * Load the data object with the given id.
 *
 * callback prototype:
 * callback(error, result);
 *
 * @method getById
 * @param id {String} id of the data object.
 * @param callback {Function} callback function.
 */
DAO.prototype.getById = function (id, callback) {
    var className = this.constructor.name,
        klass = this.readModels[className],
        callbackError = function () {
            var error = new Error('Cannot find ' + className + ' with id: ' + id);
            error.errorCode = className + 'NotFound';
            callback(error);
        };

    if ((typeof id !== 'number') ||
            (Math.floor(id) !== id)) {
        callbackError();
        return;
    }

    klass.find(id).done(function (error, result) {
        process.nextTick(function () {
            if (error) {
                callback(error);
                return;
            }

            if (!result) {
                callbackError();
                return;
            }

            callback(null, result);
        });
    });
};

/**
 * Query the databae with the given options. If cache option is provide,
 * it will check against memcache first before loading from database and
 * then store the result into memcache if it does not exists already.
 *
 * options: {
 *     cache : {
 *         key : <the-cache-key>,
 *         ttl : <time-to-live-in-seconds>
 *     },
 *     useWriteDatabase : <boolean>, // default to false
 *     sqlStmt : <sql-statement>,
 *     sqlParams : <array-of-sql-paramters>
 * }
 *
 * @method queryDatabase
 * @param options {Object} query options.
 * @param callback {Function} callback function.
 */
DAO.prototype.queryDatabase = function (options, callback) {
    DAO.queryDatabase(this.context, options, callback);
};

DAO.queryDatabase = function (context, options, callback) {
    assert(
        options && typeof options === 'object',
        'options must be a valid object.'
    );

    assert(typeof callback === 'function', 'callback must be a function.');

    var queryResult;

    async.series([
        function (next) {
            // 1. Check the cache if needed.
            var cache = options.cache,
                m;

            if (!context.memcachedClient || !cache) {
                next(null);
                return;
            }

            cacheHelper.get(context, cache.key, function (error, result) {
                if (error) {
                    next(null);
                    return;
                }

                if (result) {
                    callback(null, result);
                } else {
                    next(null);
                }
            });
        },
        function (next) {
            var client = options.useWriteDatabase ?
                    context.databaseClient : context.readDatabaseClient;

            context.logger.debug(
                'Executing sql query: %s with sqlParams %j',
                options.sqlStmt,
                options.sqlParams
            );

            client.query(
                options.sqlStmt,
                options.sqlParams,
                function (error, result) {
                    if (error) {
                        if (process.env.NODE_ENV !== 'production') {
                            error['developer-message'] = 'Failed to execute sql query(' + options.sqlStmt + ')' + ' using parameters [' + options.sqlParams + ']';
                        }
                        next(error);
                        return;
                    }
                    queryResult = result;
                    next(null);
                }
            );
        },
        function (next) {
            var cache = options.cache;

            if (!context.memcachedClient || !cache) {
                next(null);
                return;
            }

            cacheHelper.set(
                context,
                cache.key,
                queryResult,
                cache.ttl,
                function (error) {
                    next(null);
                }
            );
        }
    ], function (error) {
        callback(error, queryResult);
    });
};

module.exports = DAO;

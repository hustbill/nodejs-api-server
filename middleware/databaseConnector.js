var pg = require('pg');
var pool = require('generic-pool');
var async = require('async');
var u = require('underscore');


/**
 * Database connection pools.
 */
var pools = {};

/**
 * Middleware cache
 */
var middleware = {};

/**
 * Acquire a specified database client from the connection pool. If the pool
 * has not been created, it will create the pool first.
 *
 * The client will be stored into the context using the following name:
 * type + 'DatabaseClient'
 *
 * if the type is 'default', then the name will be databaseClient
 *
 *
 * Required:
 * request.context.config
 *
 * Output:
 * request.context.databaseClient
 * request.context.[type + 'DatabaseClient']
 *
 * @method acquireClient
 * @param request {Object} express request object.
 * @param response {Object} express response object.
 * @param next {Function} express next function.
 */
function acquireClient(type, request, response, next) {
    var context = request.context,
        logger = context.logger,
        config = context.config,
        poolConfig;

    // Create connection pool if needed.
    if (!pools[type]) {
        poolConfig = u.clone(config.databases[type].pool || {});
        poolConfig.name = type;

        poolConfig.create = function (callback) {
            var dbConfig = config.databases[type],
                databaseUrl,
                client;

            databaseUrl = [
                dbConfig.protocol,
                '://',
                dbConfig.username,
                ':',
                dbConfig.password,
                '@',
                dbConfig.host,
                ':',
                dbConfig.port,
                '/',
                dbConfig.name
            ].join('');


            logger.trace(
                'Creating database client to database: %s[%s].',
                type,
                databaseUrl
            );

            client = new pg.Client(databaseUrl);
            client.connect(callback);
        };

        poolConfig.destroy = function (client) {
            logger.trace('Destroying database client to database: %s.', type);
            client.end();
        };

        pools[type] = new pool.Pool(poolConfig);
    }

    logger.trace('Trying to acquire a client of postgre database: %s.', type);

    pools[type].acquire(function (error, client) {
        if (error) {
            error.message =
                'Failed to aquire client of postgres database: ' + type +
                ' due to: ' + error.message + '.';

            error.statusCode = 500;
            next(error);
            return;
        }

        logger.trace(
            'Successfully acquired client of postgres database: %s.',
            type
        );

        if (type === 'default') {
            context.databaseClient = client;
        } else {
            context[type + 'DatabaseClient'] = client;
        }

        // Monkey patch the end function to release the client back to the pool
        var end = response.end;
        response.end = function () {
            response.end = end;
            pools[type].release(client);
            end.apply(response, arguments);
        };

        next(null);
    });
}

/**
 * Return a middleware which will acquire a database client from the specified
 * connection pool.
 *
 * Currently there are only two type of client: default and read. Default is
 * read/write client and read type client is only for read operations.
 *
 * If no type is specified, then the client is default type.
 *
 * @method databaseConnector
 * @param type {String} type of client, defaults to "default"
 * @return {Function} an express middleware function.
 */
function databaseConnector(type) {
    type = type || 'default';

    if (!middleware[type]) {
        middleware[type] = acquireClient.bind(undefined, type);
    }

    return middleware[type];
}

module.exports = databaseConnector;

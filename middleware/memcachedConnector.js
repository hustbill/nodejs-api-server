var Memcached = require('memcached');


// Singleton for the process
var memcached;


/**
 * Create a memcached client for each request and store it into
 * context.
 *
 * Required:
 * request.context.config
 *
 * Output:
 * request.context.memcached
 *
 * @method databaseConnector
 */
function memcachedConnector(request, response, next) {
    var context = request.context,
        logger = context.logger,
        config = context.config;


    if (!memcached) {
        logger.trace(
            'Creating memcached client using config: %j',
            config.memcached
        );

        memcached = new Memcached(
            config.memcached.servers,
            config.memcached.options
        );

        memcached.on('failure', function (details) {
            logger.error('Got failure event from memcached: %j', details);
        });

        memcached.on('issue', function (details) {
            logger.warn('Got issue event from memcached: %j', details);
        });

        memcached.on('connecting', function (details) {
            logger.trace('Got connecting event from memcached: %j', details);
        });

        memcached.on('connected', function (details) {
            logger.trace('Got connected event from memcached: %j', details);
        });

        memcached.on('remove', function (details) {
            logger.trace('Got remove event from memcached: %j', details);
        });
    }

    context.memcachedClient = memcached;

    next(null);
}

module.exports = memcachedConnector;

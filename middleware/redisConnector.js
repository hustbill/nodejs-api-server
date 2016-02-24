var Redis = require('redis');


// Singleton for the process
var redis;


/**
 * Create a redis client for each request and store it into
 * context.
 *
 * Required:
 * request.context.config
 *
 * Output:
 * request.context.redisClient
 *
 * @method redisConnector
 */
function redisConnector(request, response, next) {
    var context = request.context,
        logger = context.logger,
        config = context.config,
        redisConfig = config.redis;


    if (redis) {
        context.redisClient = redis;
        next(null);
        return;
    }

    logger.trace(
        'Creating redis client using config: %j',
        config.redis
    );
    redis = Redis.createClient(redisConfig.port, redisConfig.host, redisConfig.options);
    redis.on('error', function (details) {
        logger.error('Got error event from redis: %j', details);
    });
    context.redisClient = redis;

    if (!redisConfig.password) {
        next(null);
        return;
    }

    logger.trace('auth redis, password: %s', redisConfig.password);
    redis.auth(redisConfig.password, function (error) {
        if (error) {
            next(error);
        }
        next(null);
    });
}

module.exports = redisConnector;

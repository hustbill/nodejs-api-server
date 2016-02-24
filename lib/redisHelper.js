/**
 * Redis helper
 */

var statsdHelper = require('./statsdHelper');

var ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.(\d*))?Z$/;


function getCacheType(key) {
    var pos = key.indexOf('_'),
        type;

    if (pos === -1) {
        type = key;
    } else {
        type = key.substr(0, pos);
    }

    return type;
}

function get(context, key, callback) {
    var client = context.redisClient,
        logger = context.logger,
        companyCode = context.companyCode,
        stat;

    if (!client) {
        callback(null, null);
        return;
    }

    if (companyCode) {
        key = companyCode + '.' + key;
    }

    logger.trace("Getting from redis for key '%s'.", key);
    stat = statsdHelper.beginStat(context, 'cache.get.' + getCacheType(key));
    client.get(key, function (error, result) {
        if (error) {
            stat.finishStat('failure.error');
            logger.warn(
                "Failed to read key '%s' from redis: %s",
                key,
                error.stack || error.message
            );
            callback(error);
            return;
        }

        if (!result) {
            stat.finishStat('failure.not_found');
            logger.trace(
                "Found no result for key '%s' in redis.",
                key
            );
            callback(null, null);
            return;
        }

        stat.finishStat('succeeded');

        result = JSON.parse(result, function (k, v) {
            if (typeof v === 'string') {
                var m = ISO_DATE.exec(v);
                if (m) {
                    return new Date(
                        Date.UTC(
                            +m[1],
                            +m[2] - 1,
                            +m[3],
                            +m[4],
                            +m[5],
                            +m[6],
                            +m[8]
                        )
                    );
                }
            }
            return v;
        });

        logger.trace(
            'Found (key: %s, value: %j) pair in redis.',
            key,
            result
        );
        callback(null, result);
    });
}


function set(context, key, value, ttl, callback) {
    var client = context.redisClient,
        logger = context.logger,
        companyCode = context.companyCode,
        stat;

    if (!client) {
        callback();
        return;
    }

    if (companyCode) {
        key = companyCode + '.' + key;
    }

    logger.trace("Storing to redis for key '%s'.", key);
    stat = statsdHelper.beginStat(context, 'cache.set.' + getCacheType(key));
    client.set(
        key,
        JSON.stringify(value),
        function (error, result) {
            if (error) {
                stat.finishStat('failure.error');
                logger.warn(
                    "Failed to store data into redis '%s'.",
                    error.stack || error.message
                );
                callback(error);
                return;
            }

            stat.finishStat('succeeded');
            logger.trace(
                'Stored (key: %s, value : %j) pair into redis.',
                key,
                result
            );
            callback();
        }
    );
    if (ttl > 0) {
        client.expire(key, ttl);
    }
}


function del(context, key, callback) {
    var client = context.redisClient,
        logger = context.logger,
        companyCode = context.companyCode,
        stat;

    if (!client) {
        callback();
        return;
    }

    if (companyCode) {
        key = companyCode + '.' + key;
    }

    logger.trace("Deleting key '%s' from redis", key);
    stat = statsdHelper.beginStat(context, 'cache.del.' + getCacheType(key));
    client.del(
        key,
        function (error) {
            if (error) {
                stat.finishStat('failure.error');
                logger.warn(
                    'Failed to delete key from redis: %s',
                    error.stack || error.message
                );
                callback(error);
                return;
            }

            stat.finishStat('succeeded');
            logger.trace(
                "Key '%s' deleted from redis.",
                key
            );
            callback();
        }
    );
}

exports.get = get;
exports.set = set;
exports.del = del;

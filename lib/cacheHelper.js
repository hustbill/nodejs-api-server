/**
 * Cache helper
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
    var client = context.memcachedClient,
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

    logger.trace("Getting from memcache for key '%s'.", key);
    stat = statsdHelper.beginStat(context, 'cache.get.' + getCacheType(key));
    client.get(key, function (error, result) {
        if (error) {
            stat.finishStat('failure.error');
            logger.warn(
                "Failed to read key '%s' from memcache: %s",
                key,
                error.stack || error.message
            );
            callback(error);
            return;
        }

        if (!result) {
            stat.finishStat('failure.not_found');
            logger.trace(
                "Found no result for key '%s' in memcache.",
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
            'Found (key: %s, value: %j) pair in memcache.',
            key,
            result
        );
        callback(null, result);
    });
}


function set(context, key, value, ttl, callback) {
    var client = context.memcachedClient,
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

    logger.trace("Storing to memcache for key '%s'.", key);
    stat = statsdHelper.beginStat(context, 'cache.set.' + getCacheType(key));
    client.set(
        key,
        JSON.stringify(value),
        ttl,
        function (error, result) {
            if (error) {
                stat.finishStat('failure.error');
                logger.warn(
                    "Failed to store data into memcache '%s'.",
                    error.stack || error.message
                );
                callback(error);
                return;
            }

            stat.finishStat('succeeded');
            logger.trace(
                'Stored (key: %s, value : %j) pair into memcache.',
                key,
                value
            );
            callback();
        }
    );
}


function del(context, key, callback) {
    var client = context.memcachedClient,
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

    logger.trace("Deleting key '%s' from memcache", key);
    stat = statsdHelper.beginStat(context, 'cache.del.' + getCacheType(key));
    client.del(
        key,
        function (error) {
            if (error) {
                stat.finishStat('failure.error');
                logger.warn(
                    'Failed to delete key from memcache: %s',
                    error.stack || error.message
                );
                callback(error);
                return;
            }

            stat.finishStat('succeeded');
            logger.trace(
                "Key '%s' deleted from memcache.",
                key
            );
            callback();
        }
    );
}

exports.get = get;
exports.set = set;
exports.del = del;

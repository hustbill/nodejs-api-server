/**
 * Lock helper
 */


/**
 * Aquire a lock with the specified name.
 *  options = {
 *      name : <String>
 *      timeout : <Integer>
 *  }
 *
 * @method lock
 * @param context {Object}
 * @param options {Object} or {String}
 */
exports.lock = function (context, options, callback) {
    var logger = context.logger,
        redisClient = context.redisClient,
        error;

    if (typeof options === 'string') {
        options = {
            name : options,
            timeout : 300   // 5 minutes
        };
    }

    if (!options.name) {
        error = new Error("lock name is required.");
        callback(error);
        return;
    }

    if (!redisClient) {
        error = new Error("Failed to lock '" + options.name + "'. Lock service not available.");
        callback(error);
        return;
    }

    logger.trace("Locking '%s'", options.name);
    redisClient.setnx(options.name, true, function (error, succeeded) {
        if (error) {
            logger.trace("Unable to lock '%s': %s", options.name, error.message || error);
            callback(error);
            return;
        }

        if (!succeeded) {
            logger.trace("Unable to lock '%s': Already locked by others.", options.name);
            callback(null, false);
            return;
        }

        logger.trace("'%s' has been locked successfully.", options.name);
        redisClient.expire(options.name, options.timeout, function () {
            callback(null, true);
        });
    });
};


/**
 * Unlock a lock with the specified name.
 * @method unlock
 * @param context {Object}
 * @param name {String} name of the lock.
 */
exports.unlock = function (context, name, callback) {
    var logger = context.logger,
        redisClient = context.redisClient,
        error;

    if (!name) {
        callback();
        return;
    }

    if (!redisClient) {
        error = new Error("Failed to unlock '" + name + "'. Lock service not available.");
        callback(error);
        return;
    }

    logger.trace("Unlocking '%s'", name);
    redisClient.del(name, function (error) {
        if (error) {
            logger.trace("Unable to unlock '%s': %s", name, error.message || error);
            callback(error);
            return;
        }

        logger.trace("'%s' has been unlocked successfully.", name);
        callback();
    });
};

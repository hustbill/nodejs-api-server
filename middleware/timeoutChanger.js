/**
 * Middleware to set the timeout of request.connection.
 *
 * By default nodejs set a hardcoded timeout of 2 minutes
 * for each http connection. This middleware allows us to change
 * that to a configurable value.
 * 
 * Input:
 * request.context.config.connection.timeout
 *
 * @method timeout
 */
var DEFAULT_TIMEOUT = 10 * 60 * 1000;

function timeout(request, response, next) {
    var config = request.context.config;

    request.connection.setTimeout(config.connection.timeout || DEFAULT_TIMEOUT);
    next();
}

module.exports = timeout;

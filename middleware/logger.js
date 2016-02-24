var bunyan = require('bunyan');

/**
 * Create a root logger using the correct log level from configuration and
 * create a child logger for each request and save it into context.
 *
 *
 * Required:
 * request.context.config
 *
 * Output:
 * request.context.logger
 *
 * @method logger
 */
function logger(rootLogger, request, response, next) {
    var context = request.context,
        config = context.config,
        requestLine,
        deviceInfo;

    // Initialize root logger if needed. 
    if (!rootLogger) {
        rootLogger = bunyan.createLogger({
            name : config.name,
            level : config.log.level
        });
    }

    requestLine = request.method + ' ' + request.url + ' HTTP/' +
        request.httpVersion;

    deviceInfo = request.get('X-Device-Info') || 'unknown';

    context.logger = rootLogger.child({
        ip: request.ip,
        'request-line' : requestLine,
        'device-info' : deviceInfo
    }, true);

    next(null);
}

module.exports = function (rootLogger) {
    return logger.bind(undefined, rootLogger);
};

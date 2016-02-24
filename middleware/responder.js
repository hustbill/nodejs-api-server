/**
 * Middleware to send response back to client.
 */
var bunyan = require('bunyan');
var moment = require('moment');

/**
 * Depends on the type of error object, send the JSON response to the client.
 *
 * @method responder
 * @param requestResult {Object}
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function responder(requestResult, request, response, next) {
    var context = request.context || {};
    var config = context.config || {};
    var logger = context.logger || bunyan.createLogger();
    var serverCurrentTime = moment().format('YYYY-MM-DDTHH:mm:ssZ');
    var body = {};

    // set server current time
    response.set('X-SERVER-CURRENT-TIME', serverCurrentTime);

    if ((process.env.NODE_ENV !== 'production') && (request.originalUrl.indexOf('v2') !== -1)) {
        body.request = {
            href: request.originalUrl,
            headers: request.headers,
            parameters: request.query,
            body: request.body
        };
    }
    // Skip if no request result object found
    if (!requestResult) {
        next(null);
        return;
    }

    if (typeof requestResult === 'string') {
        requestResult = new Error(requestResult);
    }

    if (requestResult instanceof Error) {
        requestResult.statusCode = requestResult.statusCode || 500;
        body.meta = {
            'x-server-current-time' : serverCurrentTime,
            code: requestResult.statusCode
        };

        if (requestResult.statusCode >= 400 && requestResult.statusCode < 500) {
            logger.debug(requestResult);
        }

        if (requestResult.statusCode >= 500) {
            logger.error(requestResult);
        }

        if (requestResult.statusCode === 401) {
            response.set('WWW-Authenticate', 'OAuth realm="users"');
        }

        if (process.env.NODE_ENV !== 'production') {
            body.meta.error = {
                'error-code' : requestResult.errorCode,
                message : requestResult.message || '',
				'developer-message' : requestResult['developer-message'] || '',
                stack : requestResult.stack || ''
            };
        } else {
            body.meta.error = {
                'error-code' : requestResult.errorCode,
                message : (requestResult.errorCode || requestResult.statusCode !== 500) ? (requestResult.message || '') : 'Operation failed.'
            };
        }

        if (requestResult.data) {
            body.meta.error.data = requestResult.data;
        }

        if (request.apiStat) {
            request.apiStat.finishStat('failure.' + requestResult.statusCode);
        }

        response.json(requestResult.statusCode, body);
    } else {
        requestResult.statusCode = requestResult.statusCode || 200;

        body.meta = {
            'x-server-current-time' : serverCurrentTime,
            code: requestResult.statusCode
        };

        logger.debug('Sending response to client:');
        logger.debug('statusCode: %s', requestResult.statusCode);

        if (requestResult.headers) {
            logger.debug('Headers: %j', requestResult.headers || {});
        }

        if (requestResult.body) {
            logger.debug('Body: %j', requestResult.body || {});
        }

        if (requestResult.headers) {
            response.set(requestResult.headers);
        }

        if (requestResult.body) {
            if (request.originalUrl.indexOf('v2') !== -1) {
                body.response = requestResult.body;
                response.json(requestResult.statusCode, body);
            } else {
                response.json(requestResult.statusCode, requestResult.body);
            }
        } else {
            if (process.env.NODE_ENV !== 'production') {
                response.json(requestResult.statusCode, body);
            } else {
                //response.status(requestResult.statusCode).send();
                response.json(requestResult.statusCode, body);
            }
        }
    }

    logger.debug('used time: ', new Date() - request.context.requestTime, ' millisecond.');
}

module.exports = responder;

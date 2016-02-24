var crypto = require('crypto');

// Constants
var TOKEN_HEADER_NAME = 'X-Organo-Authentication-Token';
var WSSID_HEADER_NAME = 'X-Organo-Wssid';

/**
 *
 * Use the X-Organo-Authentication-Token and wssid secret to generate a wssid
 *
 * @method generator
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function generator(request, response, next) {
    var context = request.context,
        config = request.context.config,
        logger = request.context.logger,
        secret = config.wssid.secret,
        token,
        wssid,
        error;

    token = request.get(TOKEN_HEADER_NAME);

    if (!token || typeof token !== 'string') {
        error = new Error('Invalid ' + TOKEN_HEADER_NAME + ': ' + token);
        error.statusCode = 401;
        next(error);
        return;
    }

    wssid = crypto.createHmac('sha256', secret).update(token).digest('base64');

    next({
        statusCode : 200,
        body : {
            wssid : wssid
        }
    });
}

/**
 *
 * Use the X-Organo-Authentication-Token and wssid secret to generate a wssid
 *
 * @method generator
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function validator(request, response, next) {
    var context = request.context,
        config = request.context.config,
        logger = request.context.logger,
        secret = config.wssid.secret,
        token,
        wssid,
        error;

    token = request.get(TOKEN_HEADER_NAME);
    wssid = request.get(WSSID_HEADER_NAME);

    if (!token || typeof token !== 'string') {
        error = new Error('Invalid ' + TOKEN_HEADER_NAME + ': ' + token);
        error.statusCode = 401;
        next(error);
        return;
    }

    if (!wssid || typeof wssid !== 'string') {
        error = new Error('Invalid ' + WSSID_HEADER_NAME + ': ' + wssid);
        error.statusCode = 401;
        next(error);
        return;
    }

    if (wssid === crypto.createHmac('sha256', secret).update(token).digest('base64')) {
        next(null);
    } else {
        error = new Error('Invalid ' + WSSID_HEADER_NAME + ': ' + wssid);
        error.statusCode = 401;
        next(error);
    }
}

module.exports.generator = generator;
module.exports.validator = validator;

/**
 * Airbrake helper
 */

var statsdHelper = require('./statsdHelper');

exports.notifyError = function (context, err, options, callback) {
    if (!context.airbrake || context.config.airbrake.disabled) {
        if (callback) {
            callback();
        }
        return;
    }

    if (!(err instanceof Error) ||      // we only notify Error object
            (!err.forceAirbrake &&      // always notify to airbrake if `forceAirbrake` was set
                (err.ignoreAirbrake ||  // don't notify to airbrake if `ignoreAirbrake` was set
                    (err.statusCode && err.statusCode !== 500)))) {  // don't notify if `statusCode` was set not as 500
        if (callback) {
            callback();
        }
        return;
    }

    if (!options) {
        options = {};
    }

    var request = options.request,
        logger = context.logger,
        params = options.params,
        key,
        stat;

    err.component = options.component;

    if (request) {
        err.url = request.protocol + "://" + request.host + request.originalUrl;
        err.component = err.component || request.url;
        err.action = request.method;
        err.params = request.params || {};
        err.params.ip = request.ip;
    }

    if (params) {
        if (!err.params) {
            err.params = {};
        }

        for (key in params) {
            if (params.hasOwnProperty(key)) {
                err.params[key] = options.params[key];
            }
        }
    }

    logger.debug("Notify error to airbrake: ", {
        message : err.message,
        url : err.url,
        component : err.component,
        params : err.params,
        stack : err.stack
    });

    stat = statsdHelper.beginStat(context, 'airbrake');
    // TODO: send the notify via queue
    context.airbrake.notify(err, function (notifyErr) {
        if (notifyErr) {
            stat.finishStat('failed');
            logger.error("Airbrake: Could not notify. " + notifyErr.message);
        } else {
            stat.finishStat('succeeded');
        }

        if (callback) {
            callback(err);
        }
    });
};

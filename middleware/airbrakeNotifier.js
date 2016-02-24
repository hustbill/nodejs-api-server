var statsdHelper = require('../lib/statsdHelper');

function notifyTo(airbrake) {
    return function (err, req, res, next) {
        if (req.context.config.airbrake.disabled) {
            next(err);
            return;
        }

        if (!(err instanceof Error) ||      // we only notify Error object
                (!err.forceAirbrake &&      // always notify to airbrake if `forceAirbrake` was set
                    (err.ignoreAirbrake ||  // don't notify to airbrake if `ignoreAirbrake` was set
                        (err.statusCode && err.statusCode !== 500)))) {  // don't notify if `statusCode` was set not as 500
            next(err);
            return;
        }

        err.url = req.protocol + "://" + req.host + req.originalUrl;
        err.component = req.url;
        err.action = req.method;
        err.params = req.params || {};
        err.params.ip = req.ip;

        if (req.context && req.context.user) {
            err.params.user = {
                userId : req.context.user.userId,
                login : req.context.user.login
            };
        }

        if (req.method === 'POST') {
            err.params.postData = req.body;
        }

        var context = req.context,
            logger = context.logger,
            stat;

        logger.debug("Notify error to airbrake: ", {
            message : err.message,
            url : err.url,
            component : err.component,
            params : err.params,
            stack : err.stack
        });

        stat = statsdHelper.beginStat(context, 'airbrake');
        // TODO: send the notify via queue
        airbrake.notify(err, function (notifyErr, url) {
            if (notifyErr) {
                stat.finishStat('failed');
                logger.error("Airbrake: Could not notify. " + notifyErr.message);
            } else {
                stat.finishStat('succeeded');
            }

            next(err);
        });
    };
}
exports.notifyTo = notifyTo;

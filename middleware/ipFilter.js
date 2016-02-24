var async = require('async');
var daos = require('../daos');


function isAllowed(rules, ip) {
    var len = rules.length,
        i,
        rule;

    for (i = 0; i < len; i += 1) {
        rule = rules[i];

        if (ip === rule) {
            return true;
        }
    }

    return false;
}


function denyAccess(next) {
    var error = new Error('Access denied.');
    error.statusCode = 403;

    next(error);
}


function ipFilter(rules) {
    return function (req, res, next) {
        var context = req.context,
            logger = context.logger,
            ip = req.ip,
            error;
        console.log(req.ip);

        logger.debug("Checking whether accessing from ip '%s' is allowed or not.", ip);

        if (!ip) {
            denyAccess(next);
            return;
        }

        // TODO: move this into configuration file
        if (ip.indexOf('192.168.') === 0) {
            next();
            return;
        }

        if (!isAllowed(rules.allow, ip)) {
            denyAccess(next);
            return;
        }

        next();
    };
}

module.exports = ipFilter;
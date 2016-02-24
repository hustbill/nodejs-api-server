var os = require('os');
var StatsD = require('node-statsd').StatsD;


function getHostName() {
    return os.hostname().split('.')[0];
}

function getDeviceInfo(req) {
    var name = req.get('X-Device-Info');

    if (!name) {
        return 'unknown';
    }

    return name.replace(/\./g, '_');
}

function statsdClient() {
    var clients = {};

    return function (req, res, next) {
        var device = getDeviceInfo(req),
            client = clients[device],
            config,
            options;

        if (client) {
            req.context.statsdClient = client;
            next();
            return;
        }

        config = req.context.config.statsd;
        options = {
            host : config.host || '127.0.0.1',
            port : config.port || 8125,
            prefix : config.prefix || '',
            suffix : config.suffix || '',
            dnsCache : config.dnsCache || false,
            mock : config.mock || false
        };

        options.suffix = options.suffix.replace('{device}', device);
        options.suffix = options.suffix.replace('{hostname}', getHostName());

        client = new StatsD(options);
        req.context.statsdClient = client;
        clients[device] = client;

        next();
    };
}

module.exports = statsdClient;

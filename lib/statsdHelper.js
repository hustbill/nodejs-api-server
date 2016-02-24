/**
 * StatsD helper
 */


function finishStat(result) {
    var stat = this,
        statsdClient = stat.statsdClient,
        counterName;

    if (!statsdClient) {
        return;
    }

    if (stat.finishAt) {
        return;
    }

    stat.finishAt = new Date();

    if (stat.timing) {
        statsdClient.timing(stat.name, (stat.finishAt - stat.beginAt));
    }

    if (stat.counting) {
        counterName = stat.name;
        if (result) {
            counterName += '.' + result;
        }
        statsdClient.increment(counterName);
    }
}

exports.beginStat = function (context, options) {
    var stat;

    if (typeof options === 'string') {
        options = {
            name : options
        };
    }

    stat = {
        finishStat : finishStat,

        statsdClient : context.statsdClient,

        name : options.name,
        timing : !options.noTiming,
        counting : !options.noCounting,
        beginAt : new Date()
    };

    return stat;
};

var statsdHelper = require('../lib/statsdHelper');

function apiRequestStat(apiName) {
    return function (req, res, next) {
        var context = req.context,
            status = '',
            stat = statsdHelper.beginStat(context, 'api.' + apiName);

        req.apiStat = stat;
        res.on('finish', function () {
            status = 'succeeded';
            if(res.statusCode){
                status += '.'+res.statusCode;
            }
            stat.finishStat(status);
        });

        next();
    };
}

module.exports = apiRequestStat;

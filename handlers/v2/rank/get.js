// GET /v2/ranks

var async = require('async');
var daos = require('../../../daos');

/**
 * Return rank json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        result = {},
        company_rank_identity = 40;
    if (context.companyCode === 'FTO') {
        company_rank_identity = 50;
    };

    rankDao = daos.createDao('ClientRank', context);
    rankDao.getAllRanksGreaterThanRankIdentity(company_rank_identity, function(error, allRanks){
        if (error) {
            next(error);
        }
        result.body = allRanks.rows;
        next(result);
    });
}

module.exports = get;

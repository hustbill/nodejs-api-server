// GET /v2/reports/organizations/unilevel/:child-distributor-id?date=weekly-date[&orders_only=1]

var async = require('async');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var searchUnilevel = require('../../../shared/report/unilevel/searchUnilevel');

/**
 * Return report organization json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function search(request, response, next) {
    var context = request.context,
        query = request.query;

    context.commissionDao = daos.createDao('Commission', context);
    context.reportDao = daos.createDao('Report', context);

    context.input = {
        date: query.date,
        child_distributor_id: request.params.id,
        orders_only: query.orders_only,
        distributor_id: context.user.distributorId
    };

    searchUnilevel(context, next);
}

module.exports = search;

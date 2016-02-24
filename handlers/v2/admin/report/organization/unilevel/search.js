// GET /v2/reports/organizations/unilevel/:child-distributor-id?date=weekly-date[&orders_only=1]

var async = require('async');
var daos = require('../../../../../../daos');
var utils = require('../../../../../../lib/utils');
var searchUnilevel = require('../../../../shared/report/unilevel/searchUnilevel');

/**
 * Return report organization json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function search(request, response, next) {
    var context = request.context,
        query = request.query,
        error,
        child_distributor_id =  query.child_distributor_id,
        parent_distributor_id = query.parent_distributor_id;

    if (!child_distributor_id || !parent_distributor_id){
        error = new Error("Invaild child_distributor_id or child_distributor_id");
        error.statusCode = 400;
        next(error);
        return;
    }

    context.commissionDao = daos.createDao('Commission', context);
    context.reportDao = daos.createDao('Report', context);

    context.input = {
        date: query.date,
        child_distributor_id: child_distributor_id,
        orders_only: query.orders_only,
        distributor_id:parent_distributor_id
    };

    searchUnilevel(context, next);
}

module.exports = search;

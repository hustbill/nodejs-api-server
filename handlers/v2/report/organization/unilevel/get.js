var async = require('async');
var daos = require('../../../../../daos');
var getUnilevel = require('../../../shared/report/getUnilevel');
var utils = require('../../../../../lib/utils');

/**
 * Return report organization json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        query = request.query;

    context.commissionDao = daos.createDao('Commission', context);
    context.reportDao = daos.createDao('Report', context);

    context.input = {
        date: query.date,
        limit: query.limit,
        offset: query.offset,
        orders_only: query.orders_only,
        unilevel: true,
        distributor_id : context.user.distributorId,
        role: query.role || null,
        ranks : query.ranks || null,
        pv_only : query.pv_only || null,
        carrer_rank_number : query.carrer_rank_number || null
    };

    getUnilevel(context, next);
}

module.exports = get;

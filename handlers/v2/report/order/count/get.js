// GET /v2/reports/orders/count

var async = require('async');
var daos = require('../../../../../daos');

/**
 *
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        responseResult = { statusCode : 200, body : {} },
        reportDao = daos.createDao('Report', context),
        distributorId = context.user.distributorId;

    reportDao.getOrdersCount(
        distributorId,
        function (error, result) {
            if (error) {
                next(error);
                return;
            }
            try {
                if (!result.rows.length) {
                    responseResult.body.count = 0;
                } else {
                    responseResult.body.count = result.rows[0].count;
                }
                next(responseResult);
            } catch (exception) {
                next(exception);
            }
        }
    );
}

module.exports = get;

// GET /v2/reports/returns

var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');

/**
 * convert the database result rows into response object.
 *
 * @method generateResponse
 * @param rows {Request} database records.
 * @param callback {Function} callback function.
 */
function generateResponse(rows) {
    var result = { statusCode : 200, body : []};

    rows.forEach(function (row) {
        result.body.push(
            {
                'order-number' : row.order_number,
                'distributor-id' : parseInt(row.dist_id, 10),
                'full-name' : row.fullname,
                'order-date' : (row.order_date).toYMD(),
                'return-date' : (row.returned_date).toYMD(),
                'total-sales' : row.total_sales,
                'total-dt-volume' : row.total_dt_vol,
                'total-ul-volume' : row.total_ul_vol
            }
        );
    });

    return result;
}

/**
 * Return returned orders json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        reportDao = daos.createDao('Report', context),
        responseResult,
        distributorId = context.user.distributorId,
        startDate = utils.getFirstDayOfLastMonth(),
        endDate = utils.getCurrentYYYYMMDD();

    reportDao.getReturns(
        distributorId,
        startDate,
        endDate,
        function (error, result) {
            if (error) {
                next(error);
                return;
            }
            try {
                responseResult = generateResponse(result.rows);
            } catch (exception) {
                next(exception);
                return;
            }
            next(responseResult);
        }
    );
}

module.exports = get;

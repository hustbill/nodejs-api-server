// GET /v2/reports/orders

var async = require('async');
var daos = require('../../../../daos');

/**
 * convert the database result rows into response object.
 *
 * @method generateResponse
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function generateResponse(rows) {
    var result = { statusCode : 200, body : []},
        trackingNo;

    rows.forEach(
        function (row) {
            trackingNo = (row.tracking_number === '{""}') ? "" : row.tracking_number;
            result.body.push(
                {
                    'order-number' : row.order_number,
                    'order-date' : row.order_date,
                    'item-total' : row.item_total,
                    total : row.total,
                    status : row.order_state,
                    'shipment-status' : row.shipment_state,
                    'tracking-number' : trackingNo,
                    'qualification-volume' : row.qualification_volume,
                    'personal-volume' : row.personal_volume
                }
            );
        }
    );

    return result;
}

/**
 *
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context,
        reportDao = daos.createDao('Report', context),
        distributorId = context.user.distributorId,
        query = request.query,
        offset = query.offset,
        limit = query.limit,
        responseResult;

    if (isNaN(offset)) {
        offset = 0;
    } else {
        offset = parseInt(offset, 10);
    }

    if (isNaN(limit)) {
        limit = 25;
    } else {
        limit = parseInt(limit, 10);
    }

    reportDao.getOrders(
        distributorId,
        offset,
        limit,
        function (error, result) {
            if (error) {
                next(error);
                return;
            }
            try {
                responseResult = generateResponse(result.rows);
            } catch (exception) {
                next(exception);
            }
            next(responseResult);
        }
    );
}

module.exports = list;

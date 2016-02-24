// GET /v2/customers/orders

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');

function generateResponse(data) {
    var result = {
            statusCode: 200,
            body: {
                meta: data.meta,
                data: []
            }
        };

    data.data.forEach(function(item){
        result.body.data.push({
            'distributor-id': item.customer_id,
            'first-name': item.firstname,
            'last-name': item.lastname,
            'order-number': item.order_number,
            'order-date': item.order_date,
            'item-total': item.item_total,
            'adjustment-total': item.adjustment_total,
            'order-total': item.order_total,
            'order-state': item.order_state,
            'payment-state': item.payment_state,
            'qv': item.qv,
            'cv': item.cv
        });
    });

    return result;
}

/**
 * Query retail customer
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context,
        logger = context.logger,
        sponsorId = context.user.distributorId,
        customerId = request.query['distributor-id'],
        userName = request.query['user-name'],
        offset = request.query.offset,
        limit = request.query.limit,
        error;

    
    var customerDAO = daos.createDao('Customer', context);

    async.waterfall([

        function(callback) {
            if (offset) {
                request.check('offset', 'offset must be int').notEmpty().isInt();
                offset = parseInt(offset, 10);
            } else {
                offset = 0; //default
            }

            if (limit) {
                request.check('limit', 'limit must be int').notEmpty().isInt();
                limit = parseInt(limit, 10);
            } else {
                limit = 25; //default
            }

            var errors = request.validationErrors();
            if (errors && errors.length > 0) {
                error = new Error(errors[0].msg);
                error.statusCode = 400;
                return callback(error);
            }

            callback();

        },
        function(callback) {

            customerDAO.getOrders({
                sponsorId: sponsorId,
                customerId: customerId,
                userName: userName,
                limit: limit,
                offset: offset
            }, callback);
        }
    ], function(error, result) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(result));
    });
}

module.exports = list;
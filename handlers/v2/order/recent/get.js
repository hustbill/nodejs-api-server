// GET /v2/orders/recent

var async = require('async');
var daos = require('../../../../daos');
var du = require('date-utils');
var rankMap = require('../../../../lib/constants').rankMap;
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');

/**
 * Validate the request.
 *
 * @method validateRequest
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function validateRequest(request, callback) {
    var error,
        context = request.context,
        query = request.query,
        limit = query.limit,
        offset = query.offset;

    context.input = {};
    if (limit !== undefined) {
        if (isNaN(parseInt(limit, 10))) {
            error = new Error('Invalid limit');
            error.statusCode = 400;
            callback(error);
            return;
        }
        context.input.limit = limit;
    } else {
        context.input.limit = 5;
    }

    if (offset !== undefined) {
        if (isNaN(parseInt(offset, 10))) {
            error = new Error('Invalid offset');
            error.statusCode = 400;
            callback(error);
            return;
        }
        context.input.offset = offset;
    } else {
        context.input.offset = 0;
    }

    callback(null);
}

/**
 * Load recent orders
 *
 * @method loadRecentOrders
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function loadRecentOrders(request, callback) {
    var context = request.context,
        input = context.input,
        limit = input.limit,
        offset = input.offset,
        orderDao = daos.createDao('Order', context),
        userId = context.user.userId;

    orderDao.getRecentOrders(
        userId,
        offset,
        limit,
        function (error, orders) {
            if (error) {
                callback(error);
                return;
            }
            context.result = orders;
            callback(null);
        }
    );
}

/**
 * convert the database result rows into response object.
 *
 * @method generateResponse
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function generateResponse(request, callback) {
    var context = request.context,
        result = { statusCode : 200, body : []},
        orders = context.result;

    orders = orders.map(function(order){
        //
        if(order.country_name){
            order.shippingAddress = order.shippingAddress || {};
            order.shippingAddress.country_name = order.country_name;
        }

        if (order.trackings === null) {
            order.trackings = '';
            return order;
        }
		
        var trackings = order.trackings.replace(/{|}/g, '');
        if (trackings !== 'NULL') {
            order.trackings = trackings;
            return order;
        }else{
            order.trackings = '';
            return order;
        }
    });

    result.body = mapper.orders(orders);
    callback(result);
}

/**
 * Return recent orders json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    async.series([
        function (callback) {
            validateRequest(request, callback);
        },
        function (callback) {
            loadRecentOrders(request, callback);
        },
        function (callback) {
            generateResponse(request, callback);
        }
    ], next);
}

module.exports = get;

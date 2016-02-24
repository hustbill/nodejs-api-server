// GET /v2/orders?offset=<offset>&limit=<limit>

var async = require('async');
var daos = require('../../../daos');
var du = require('date-utils');
var rankMap = require('../../../lib/constants').rankMap;
var utils = require('../../../lib/utils');
var mapper = require('../../../mapper');

function getRequestOptions(request, callback) {
    var error,
        context = request.context,
        query = request.query,
        limit = query.limit,
        offset = query.offset,
        getOrdersOptions = {};

    if (limit !== undefined) {
        if (isNaN(parseInt(limit, 10))) {
            error = new Error('Invalid limit');
            error.statusCode = 400;
            callback(error);
            return;
        }
        getOrdersOptions.limit = limit;
    } else {
        getOrdersOptions.limit = 25;
    }

    if (offset !== undefined) {
        if (isNaN(parseInt(offset, 10))) {
            error = new Error('Invalid offset');
            error.statusCode = 400;
            callback(error);
            return;
        }
        getOrdersOptions.offset = offset;
    } else {
        getOrdersOptions.offset = 0;
    }

    callback(null, getOrdersOptions);
}

function getOrders(context, getOrdersOptions, callback) {
    var orderDao = daos.createDao('Order', context),
        getOrdersResult = {};
    async.waterfall([
        function (callback) {
            getOrdersOptions.userId = context.user.userId;
            orderDao.getOrdersOfUser(getOrdersOptions, callback);
        },

        function (orders, callback) {
            getOrdersResult.orders = orders;
            orderDao.getOrderCountOfUser(getOrdersOptions.userId, callback);
        },

        function (count, callback) {
            getOrdersResult.count = count;
            getOrdersResult.offset = getOrdersOptions.offset;
            getOrdersResult.limit = getOrdersOptions.limit;

            callback(null, getOrdersResult);
        }
    ], callback);
}


function generateResponse(getOrdersResult, callback) {
    var result = { statusCode : 200, body : []},
        orders = getOrdersResult.orders;

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

    result.body = {
        meta : {
            count : getOrdersResult.count,
            offset : getOrdersResult.offset,
            limit : getOrdersResult.limit
        },
        orders : mapper.orders(orders)
    };

    callback(result);
}

/**
 * Get orders of current user. 
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    async.waterfall([
        function (callback) {
            getRequestOptions(request, callback);
        },
        function (getOrdersOptions, callback) {
            getOrders(request.context, getOrdersOptions, callback);
        },
        function (getOrdersResult, callback) {
            generateResponse(getOrdersResult, callback);
        }
    ], next);
}

module.exports = get;

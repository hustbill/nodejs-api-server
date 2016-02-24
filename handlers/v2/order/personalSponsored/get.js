// GET /v2/orders/personal-sponsored?role-code=XXX&date=YYYYMMDD

var async = require('async');
var daos = require('../../../../daos');
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
        context.input.limit = 25;
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

    context.input.date = query.date || utils.getFirstDayOfThisMonth(new Date());
    context.input.roleCode = query['role-code'] || 'R';
    context.input.distributorId = context.user.distributorId;

    callback(null);
}

/**
 * convert the database result rows into response object.
 *
 * @method generateResponse
 * @param request {orders} orders
 */
function generateResponse(orders) {
    var results = [];

    if (!orders) {
        return [];
    };

    orders.forEach(function(order){
        console.log(require('util').inspect(order.shippments.selectedValues));
        order.shippments.selectedValues['shipping-address'] = {
            "country" : order.country.name
        };
        var result = {
            "customer-id" : order['customer-id'],
            "customer-name" : order['customer-name'],
            "details" : order['order-detail'],
            "shippments" : order.shippments.selectedValues
        }
        results.push(result);
    });

    return results;
}

function generateMeta(input) {
    return {
        count: input.count,
        offset: input.offset,
        limit: input.limit
    }
}

function getOrderDetail(infos, orderDao, callback){
    var orders = [],
        orderDetailOptions;
    async.map(infos, function(info, callbackDetail){
        orderDetailOptions = {};
        orderDetailOptions.orderNumber = info['order-number'];
        orderDao.getOrderDetails(orderDetailOptions, function(error, orderDetail){
            info['order-detail'] = orderDetail;
            orders.push(info);
            callbackDetail();
        });
    }, function(){
        callback(null, orders);
    });
}

function getShippingFromOrderDetail(context, orderDetails, callback){
    var shippmentDao = daos.createDao('Shipment', context),
        orderDao = daos.createDao('Order', context),
        results = [];
    async.map(orderDetails, function(orderDetail, callbackShipments){
        shippmentDao.getShipmentsOfOrder(orderDetail['order-detail'].id, function(error, shippments){
            if (shippments.length !==0 ) {
                orderDetail.shippments = shippments[0];
            };
            orderDao.getCountryByOrderId(orderDetail['order-detail'].id, function(error, country){
                if (country.length !==0) {
                    orderDetail.country = country.rows[0];
                };
                results.push(orderDetail);
                callbackShipments();
            }); 
        });
    }, function(){
        callback(null, results);
    });
}

function getOrderNumberAndCustomerInfoFromOrder(orders){
    var info = [];
    orders.forEach(function(order){
        //only get the first order number
        var orderInfos = order.order_info.split(":");
        var item = {
            'order-number' : orderInfos[0].split(",")[0],
            'customer-id' : order.distributor_id,
            'customer-name' : order.full_name
        }
        info.push(item);
    });
    return info;
}

/**
 * Return recent orders json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        orderDao = daos.createDao('Order', context),
        count,
        orderDetails;
        

    async.waterfall([
        function (callback) {
            validateRequest(request, callback);
        },
        function (callback) {
            orderDao.getPersonalSponsoredOrdersByMonthCount(context.input, callback);
        },
        function (data, callback) {
            context.input.count = data.rows[0].count;
            orderDao.getPersonalSponsoredOrdersByMonth(context.input, callback);
        },
        function (data, callback) {
            var orders = data.rows;
            if (orders.length === 0) {
                callback(null, []);
                return;
            };
            info = getOrderNumberAndCustomerInfoFromOrder(orders);
            getOrderDetail(info, orderDao, callback);
        },
        function (data, callback) {
            orderDetails = data;
            getShippingFromOrderDetail(context, orderDetails, callback);
        }
    ], function (error, results) {
        if (error) {
            next({
                body: []
            });
        };

        next({ 
            statusCode : 200, 
            body : {
                meta : generateMeta(context.input),
                rows : generateResponse(results)
            }
        });
    });
}

module.exports = get;

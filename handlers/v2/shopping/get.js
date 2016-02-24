// GET /v2/shopping-dashboard
var daos = require('../../../daos'),
    async = require('async');

function get(request, response, next) {
    var context = request.context,
        logger = context.logger,
        dashboardDao = daos.createDao('Dashboard', context),
        distributorId = context.user.distributorId,
        result = {},
        orderInfo;

    async.waterfall([
        function (callback) {
            dashboardDao.getShoppingReport(context, callback);
        },
        function (rows, callback) {
            orderInfo = rows.rows;
            parseOrder(distributorId, orderInfo, callback);
        },
        function (selfOrder, retailOrder, callback) {
            result['personal-order'] = parseSelfOrder(selfOrder);
            result['retail-and-retail-backoffice-order'] = parseRetailOrder(retailOrder);
            callback(null, result);
        }
    ], function (error, result) {
        if (error) {
            result = error;
            next(result);
            return;
        }
        next({ 
            statusCode : 200, 
            body : result
        });
    });
}

function parseOrder(distributor_id, orderInfos, callback){
    var result = [],
        selfOrder = [];
    if (orderInfos.length === 0) {
        callback(null, [], []);
    };
    orderInfos.forEach(function(orders){
        var orderInfo;
        if (orders.distributor_id === distributor_id) {
            selfOrder = parseOrderInfo(orders.order_info);
        };
        orderInfo = parseOrderInfo(orders.order_info);
        result.push(orderInfo);
    });
    callback(null, selfOrder, result);
}

function parseOrderInfo(orderInfo){
    var orderInfos =[],
        result = [];
    if (!orderInfo) {
        return [];
    };
    orderInfos = orderInfo.split(':');
    orderInfos.forEach(function(order){
        if (!order) {
            return;
        };  
        var item = order.split(',');
        result.push(item);
    });
    return result;
}

function parseSelfOrder(orders){
    var total = 0;
    if (orders) {
        orders.forEach(function(order){
            total += order[1] * 1;
        });
    };
    return total;
}

function parseRetailOrder(orders){
    var total = 0;
    orders.forEach(function(order){
        order.forEach(function(item){
            total += item[1] * 1;
        });
    });
    return total;
}

module.exports = get;

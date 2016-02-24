// GET /v2/orders/:orderId

var async = require('async');
var u = require('underscore');
var daos = require('../../../daos');
var utils = require('../../../lib/utils');
var mapper = require('../../../mapper');



function generateResponse(order) {
    return {
        statusCode : 200,
        body : mapper.order(order)
    };
}

/**
 *
 * get order info
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        logger = context.logger,
        orderDao = daos.createDao('Order', context),
        idOrNum = request.params.idOrNum,
        error;

    async.waterfall([
        //validate
        function(callback){
           
            if(u.isString(idOrNum) && !u.isEmpty(idOrNum)){
                callback();
                return;
            }
            error = new Error('OrderId or OrderNumber is required');
            error.errorCode = 'IdOrNumberIsRequired';
            error.statusCode = 400;
            callback(error);
        },

        function (callback) {
            var orderDetailOptions = {};

            if(/^\d+$/.test(idOrNum)){
                orderDetailOptions.orderId = parseInt(idOrNum, 10);
            }else{
                orderDetailOptions.orderNumber = idOrNum;
            }

            orderDao.getOrderDetails(orderDetailOptions, callback);
        }
    ], function (error, order) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(order));
    });
}

module.exports = get;

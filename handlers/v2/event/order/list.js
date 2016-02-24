// GET /v2/events/:eventCode/orders

var async = require('async');
var daos = require('../../../../daos');
var du = require('date-utils');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');


/**
 * Return orders of an event
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        eventCode = request.params.eventCode,
        orderDao = daos.createDao('Order', context);

    orderDao.getOrdersByEventCode(eventCode, function (error, orders) {
        if (error) {
            next(error);
            return;
        }

        next({
            statusCode : 200,
            body : mapper.orders(orders)
        });
    });
}

module.exports = get;

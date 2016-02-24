// POST /v2/orders/:orderId/shipping

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');


function getPostData(request) {
    var body = request.body,
        data = {
            shippingMethodId : parseInt(body['shipping-method-id'], 10),
            shippingAddress : mapper.parseShippingAddress(body['shipping-address'])
        };
    return data;
}

function generateResponse(order) {
    var body = {},
        result = {
            statusCode : 200,
            body : body
        };

    body['shipping-method'] = mapper.shippingMethod(order.shippingMethod);
    body['shipping-address'] = mapper.shippingAddress(order.shippingAddress);

    return result;
}

/**
 *
 * update shipping info of order
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        orderDao = daos.createDao('Order', context),
        orderId = request.params.orderId,
        postData = getPostData(request),
        error;

    async.waterfall([
        function (callback) {
            orderDao.changeOrderShippingInfo(orderId, postData, callback);
        }

    ], function (error, order) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(order));
    });
}

module.exports = post;

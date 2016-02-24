// POST /v2/admin/coupons

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');


function getPostData(request) {
    var body = request.body,
        data = mapper.parseCoupon(body);

    return data;
}


function generateResult(coupon) {
    return {
        statusCode : 200,
        body : mapper.coupon(coupon)
    };
}

/**
 *
 * Create coupon
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        createCouponOptions = getPostData(request),
        error;

    async.waterfall([
        function (callback) {
            var couponDao = daos.createDao('Coupon', context);
            couponDao.createCoupon(createCouponOptions, callback);
        }

    ], function (error, coupon) {
        if (error) {
            next(error);
            return;
        }

        next(generateResult(coupon));
    });
}

module.exports = post;

// GET /v2/coupons

var daos = require('../../../daos');
var mapper = require('../../../mapper');
var moment = require('moment');

function generateResponse(coupons) {
    var result = { statusCode : 200};


    result.body = mapper.coupons(coupons);

    return result;
}

/**
 * list all coupons of current user.
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        couponDao = daos.createDao('Coupon', context),
        getCouponsOptions = {},
        error;


    getCouponsOptions = {
        userId : context.user.userId
    };
    couponDao.getAvailableCouponsForUser(getCouponsOptions, function (error, coupons) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(coupons));
    });
}

module.exports = get;

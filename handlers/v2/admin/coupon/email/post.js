// POST /v2/admin/coupons/:couponCode/emails

var daos = require('../../../../../daos');


/**
 * send gift card email
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        couponDao = daos.createDao('Coupon', context),
        code = request.body['coupon-code'],
        emails = request.body['recipient-emails'],
        error;

    if (!code) {
        error = new Error('Code is required.');
        error.errorCode = 'InvalidCouponCode';
        error.statusCode = 400;
        next(error);
        return;
    }
    if (!emails) {
        error = new Error('recipient-emails is required.');
        error.errorCode = 'InvalidRecipientEmails';
        error.statusCode = 400;
        next(error);
        return;
    }

    couponDao.sendEmailByCouponCode({
        couponCode: code,
        recipientEmails: emails
    }, function (error, giftCard) {
        if (error) {
            next(error);
            return;
        }

        next({
            statusCode : 200,
            body : {
                success : true,
                'recipient-emails' : emails
            }
        });
    });
}

module.exports = post;

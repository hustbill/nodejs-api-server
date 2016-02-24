// POST /v2/profile/password

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');


function getPostData(request) {
    var body = request.body,
        postData = {};

    postData.oldPassword = body['old-password'];
    postData.newPassword = body['new-password'];

    return postData;
}

/**
 * Change password of user
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        userId = context.user.userId,
        postData = getPostData(request),
        error;

    if (!postData.oldPassword) {
        error = new Error("Old password is required.");
        error.errorCode = 'InvalidOldPassword';
        error.statusCode = 400;
        next(error);
        return;
    }

    if (!postData.newPassword) {
        error = new Error("New password is required.");
        error.errorCode = 'InvalidNewPassword';
        error.statusCode = 400;
        next(error);
        return;
    }

    if (!utils.isValidPassword(postData.newPassword)) {
        error = new Error('Invalid new password.');
        error.errorCode = 'InvalidNewPassword';
        error.statusCode = 400;
        next(error);
        return;
    }

    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.changePassword(postData.oldPassword, postData.newPassword, callback);
        }
    ], function (error) {
        if (error) {
            next(error);
            return;
        }

        next({statusCode : 200});
    });
}

module.exports = post;

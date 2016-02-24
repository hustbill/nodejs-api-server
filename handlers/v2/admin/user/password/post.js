// POST /v2/admin/users/:userId/password

var async = require('async');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');


function getPostData(request) {
    var body = request.body,
        postData = {};

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
        userId = parseInt(request.params.userId, 10),
        postData = getPostData(request),
        error;

    if (!userId) {
        error = new Error("User id is required.");
        error.errorCode = 'InvalidUserId';
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
            userDao.changePasswordByAdmin(userId, postData.newPassword, callback);
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

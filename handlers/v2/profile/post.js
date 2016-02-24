// POST /v2/profile

var async = require('async');
var daos = require('../../../daos');

function getPostData(request) {
    var body = request.body,
        postData = {
            dateOfBirth : body['birth-date'],
            login : body.login,
            email : body.email,
            ssn : body.ssn,
            company : body.company ? body.company.trim() : null
        };
    return postData;
}

/**
 * Update the profile of user
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        userId = context.user.userId,
        distributorId = context.user.distributorId,
        postData = getPostData(request),
        responseResult;

    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context),
                updateProfileOptions = {
                    userId : userId,
                    login : postData.login,
                    email : postData.email
                };
            userDao.updateProfile(updateProfileOptions, callback);
        },

        function (callback) {
            var distributorDao = daos.createDao('Distributor', context),
                updateProfileOptions = {
                    distributorId : distributorId,
                    dateOfBirth : postData.dateOfBirth,
                    socialSecurityNumber : postData.ssn,
                    company : postData.company
                };
            distributorDao.updateProfile(updateProfileOptions, callback);
        }
    ], function (error) {
        if (error) {
            next(error);
            return;
        }

        next({statusCode : 200});
    });
}

module.exports = get;

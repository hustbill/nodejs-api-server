// POST /v2/admin/users/:userId/profile

var async = require('async');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');

function getPostData(request) {
    var body = request.body,
        postData = {
            dateOfBirth : body['birth-date'],
            socialSecurityNumber : body.ssn,
            company : body.company ? body.company.trim() : null,
            taxnumber : body.taxnumber,
            login : body.login,
            email : body.email
        };

    if (body.hasOwnProperty('unilevel-sponsor-distributor-id')) {
        var unilevel_sponsor_distributor_id = parseInt(body['unilevel-sponsor-distributor-id'], 10);
        postData.unilevelSponsorId = isNaN(unilevel_sponsor_distributor_id) ? null :  unilevel_sponsor_distributor_id;
    }

    if (body.hasOwnProperty('enrollment-status')) {
        var enrollment_status = parseInt(body['enrollment-status'], 10);
        postData.enrollmentStatus = isNaN(enrollment_status) ? null :  enrollment_status;
    }

    if (body.hasOwnProperty('next-renewal-date')) {
        var next_renewal_date = body['next-renewal-date'];
        postData.nextRenewalDate = utils.isNullOrEmpty(next_renewal_date) ? null : new Date(Date.parse(next_renewal_date));
    }

    if(body.hasOwnProperty('special-distributor-next-renewal-date')) {
        var special_distributor_next_renewal_date = body['special-distributor-next-renewal-date'];
        postData.nextSpecialDistributorRenewalDate =
            utils.isNullOrEmpty(special_distributor_next_renewal_date) ?
            null :
            new Date(Date.parse(special_distributor_next_renewal_date));
    }

    if (body.hasOwnProperty('customer-id')) {
        postData.customerId = body['customer-id'];
    }

    return postData;
}

/**
 * Update the profile of user
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        userId = parseInt(request.params.userId, 10),
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
                    userId : userId,
                    unilevelSponsorId : postData.unilevelSponsorId,
                    enrollmentStatus : postData.enrollmentStatus,
                    dateOfBirth : postData.dateOfBirth,
                    company : postData.company,
                    socialSecurityNumber : postData.socialSecurityNumber,
                    taxnumber : postData.taxnumber,
                    nextRenewalDate : postData.nextRenewalDate,
                    nextSpecialDistributorRenewalDate: postData.nextSpecialDistributorRenewalDate,
                    customerId : postData.customerId
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

module.exports = post;

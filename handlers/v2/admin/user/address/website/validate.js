/**
 * Validate website address
 */

var async = require('async');
var daos = require('../../../../../../daos');
var utils = require('../../../../../../lib/utils');



function getPostData(request) {
    var body = request.body,
        data = {
            // common
            firstname : body['first-name'],
            middleabbr : body.m,
            lastname : body['last-name'],
            phone : body.phone,

            // website
            email : body.email,
            fax : body.fax,
            mobile_phone : body.mobile
        };
    return data;
}


function generateResponse(failures) {
    var result = {statusCode : 200};

    result.body = {
        failures : failures || []
    };

    return result;
}

/**
 *
 * Validate distributor's website addresses
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function validateWebsiteAddress(request, response, next) {
    var context = request.context,
        addressDao = daos.createDao('Address', context),
        addressData = getPostData(request);

    addressDao.validateWebsiteAddress(addressData, function (error, failures) {
        next(error || generateResponse(failures));
    });
}

module.exports = validateWebsiteAddress;

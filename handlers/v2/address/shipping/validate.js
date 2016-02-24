/**
 * Validate shipping address
 */

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');



function getPostData(request) {
    var body = request.body,
        data = {
            // common
            firstname : body['first-name'],
            middleabbr : body.m,
            lastname : body['last-name'],
            phone : body.phone,

            // billing / home / shipping
            address1 : body.street,
            address2 : body['street-cont'],
            city : body.city,
            zipcode : body.zip.replace(/[^0-9]/ig,""),
            state_id : parseInt(body['state-id'], 10) || 0,
            country_id : parseInt(body['country-id'], 10) || 0
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
 * Validate distributor's shipping addresses
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function validateShippingAddress(request, response, next) {
    var context = request.context,
        userId = request.body['user-id'] || (context.user && context.user.userId),
        userDao = daos.createDao('User', context),
        addressDao = daos.createDao('Address', context),
        addressData = getPostData(request);

    async.waterfall([
        function (callback) {
            addressDao.validateShippingAddress(addressData, callback);
        }
    ], function (error, failures) {
        next(error || generateResponse(failures));
    });
}

module.exports = validateShippingAddress;

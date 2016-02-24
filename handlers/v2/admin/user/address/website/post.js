/**
 * Change website address
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

function generateResponse(address) {
    var result = {statusCode : 200};

    result.body = {
        id: address.id,
        'first-name': address.firstname,
        m: address.middleabbr,
        'last-name': address.lastname,
        phone: address.phone,

        email : address.email,
        fax : address.fax,
        mobile : address.mobile_phone
    };

    return result;
}

/**
 *
 * change distributor's website addresses
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        addressDao = daos.createDao('Address', context),
        userDao = daos.createDao('User', context),
        userId = parseInt(request.params.userId, 10),
        addressData = getPostData(request),
        newAddress,
        error;

    if (!userId) {
        error = new Error('User id is required.');
        error.errorCode = 'InvalidUserId';
        error.statusCode = 400;
        next(error);
        return;
    }

    async.waterfall([
        function (callback) {
            addressDao.createWebsiteAddress(addressData, callback);
        },

        function (address, callback) {
            newAddress = address;
            userDao.changeWebsiteAddressId(userId, address.id, callback);
        }
    ], function (error) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(newAddress));
    });
}

module.exports = post;

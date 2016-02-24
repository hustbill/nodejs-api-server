/**
 * Change billing address
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
            zipcode : body.zip,
            state_id : parseInt(body['state-id'], 10) || 0,
            country_id : parseInt(body['country-id'], 10) || 0
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

        street : address.address1,
        'street-cont' : address.address2,
        city : address.city,
        zip : address.zipcode,
        state : address.state_name,
        'state-id' : address.state_id,
        country : address.country_name,
        'country-id' : address.country_id
    };

    return result;
}

/**
 *
 * change distributor's billing addresses
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(request, response, next) {
    var context = request.context,
        addressDao = daos.createDao('Address', context),
        userDao = daos.createDao('User', context),
        userId = context.user.userId,
        addressData = getPostData(request),
        newAddress;

    async.waterfall([
        function (callback) {
            addressDao.createBillingAddress(addressData, callback);
        },

        function (address, callback) {
            newAddress = address;
            userDao.changeBillingAddressId(userId, address.id, callback);
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

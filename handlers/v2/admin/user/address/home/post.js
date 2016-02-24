/**
 * Change home address
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

            // billing / home / shipping
            address1 : body.street,
            address2 : body['street-cont'],
            city : body.city,
            zipcode : body.zip,
            state_id : parseInt(body['state-id'], 10) || 0,
            country_id : parseInt(body['country-id'], 10) || 0,

            // home
            joint_firstname : body['joint-first-name'],
            joint_middleabbr : body['joint-m'],
            joint_lastname : body['joint-last-name']
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
        'country-id' : address.country_id,

        'joint-first-name' : address.joint_firstname,
        'joint-m' : address.joint_middleabbr,
        'joint-last-name' : address.joint_lastname
    };

    return result;
}

/**
 *
 * change distributor's home addresses
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
            addressDao.createHomeAddress(addressData, callback);
        },

        function (address, callback) {
            newAddress = address;
            userDao.changeHomeAddressId(userId, address.id, callback);
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

/**
 * Change home address
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

function checkCountryId(addressData, userId, userDao, addressDao, callback) {
    async.waterfall([
        function (callback) {
            userDao.getById(userId, callback);
        },

        function (user, callback) {
            userDao.getHomeAddressOfUser(user, callback);
        },

        function (originalHomeAddress, callback) {
            if (!originalHomeAddress) {
                callback();
                return;
            }

            if (originalHomeAddress.country_id &&
                    (originalHomeAddress.country_id !== addressData.country_id)) {
                var error = new Error("Country of address can't be different with your current country.");
                error.errorCode = 'InvalidCountryId';
                error.ignoreAirbrake = true;
                callback(error);
                return;
            }

            callback();
        }
    ], callback);
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
        userId = context.user.userId,
        addressData = getPostData(request),
        newAddress;

    async.waterfall([
        function (callback) {
            checkCountryId(addressData, userId, userDao, addressDao, callback);
        },

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

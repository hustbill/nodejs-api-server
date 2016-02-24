/**
 * Change shipping address
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

function checkCountryId(context, addressData, userId, userDao, addressDao, callback) {
    async.waterfall([
        function (callback) {
            userDao.getById(userId, callback);
        },

        function (user, callback) {
            userDao.getHomeAddressOfUser(user, function (error, homeAddress) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!homeAddress) {
                    error = new Error("Please set home address first.");
                    error.errorCode = 'HomeAddressNotSet';
                    callback(error);
                    return;
                }

                callback(null, homeAddress);
            });
        },

        function (soldAddress, callback) {
            var countryshipDao = daos.createDao('Countryship', context);
            countryshipDao.canShip(soldAddress.country_id, addressData.country_id, callback);
        },

        function (canShip, callback) {
            if (!canShip) {
                var error = new Error("Can't ship to this country.");
                error.errorCode = 'InvalidCountryId';
                callback(error);
                return;
            }
            callback();
        }
    ], callback);
}

/**
 *
 * change distributor's shipping addresses
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
            checkCountryId(context, addressData, userId, userDao, addressDao, callback);
        },

        function (callback) {
            addressDao.createShippingAddress(addressData, callback);
        },

        function (address, callback) {
            newAddress = address;
            userDao.changeShippingAddressId(userId, address.id, callback);
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

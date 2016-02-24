/**
 * Validate home address
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


function generateResponse(failures) {
    var result = {statusCode : 200};

    result.body = {
        failures : failures || []
    };

    return result;
}

function checkCountryId(addressData, userId, userDao, addressDao, callback) {
    async.waterfall([
        function (callback) {
            userDao.getById(userId, callback);
        },

        function (user, next) {
            userDao.getHomeAddressOfUser(user, function (error, homeAddress) {
                if (error) {
                    callback(error);
                    return;
                }

                // allow set address of any country if one never set his sold address
                if (!homeAddress) {
                    callback();
                    return;
                }

                next(null, homeAddress);
            });
        },

        function (originalSoldAddress, callback) {
            if (originalSoldAddress.country_id !== addressData.country_id) {
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
 * validate distributor's home addresses
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function validateHomeAddress(request, response, next) {
    var context = request.context,
        userId = request.body['user-id'] || (context.user && context.user.userId),
        userDao = daos.createDao('User', context),
        addressDao = daos.createDao('Address', context),
        addressData = getPostData(request);

    async.waterfall([
        function (callback) {
            addressDao.validateHomeAddress(addressData, callback);
        }
    ], function (error, failures) {
        next(error || generateResponse(failures));
    });
}


module.exports = validateHomeAddress;

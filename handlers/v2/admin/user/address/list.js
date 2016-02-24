// GET /v2/addresses?types=billing,home,shipping,website

var async = require('async');
var daos = require('../../../daos');
var utils = require('../../../lib/utils');


function populateResponseResult(addressType, responseResult, address) {
    var result;

    result = {
        id: address.id,
        'first-name': address.firstname,
        m: address.middleabbr,
        'last-name': address.lastname,
        phone: address.phone
    };

    if (addressType === 'website') {
        result.email = address.email;
        result.fax = address.fax;
        result.mobile = address.mobile_phone;
    } else {
        result.street = address.address1;
        result['street-cont'] = address.address2;
        result.city = address.city;
        result.zip = address.zipcode;
        result.state = address.state_name;
        result['state-id'] = address.state_id;
        result.country = address.country_name;
        result['country-id'] = address.country_id;
    }

    if (addressType === 'home') {
        result['joint-first-name'] = address.joint_firstname;
        result['joint-m'] = address.joint_middleabbr;
        result['joint-last-name'] = address.joint_lastname;
    }

    //responseResult.body.push(result);
	responseResult.body[addressType] = result;
}


function generateResponse(addresses) {
    var responseResult = {
            statusCode : 200,
            body: {}
        };

    if (addresses.home) {
        populateResponseResult('home', responseResult, addresses.home);
    }
    if (addresses.billing) {
        populateResponseResult('billing', responseResult, addresses.billing);
    }
    if (addresses.shipping) {
        populateResponseResult('shipping', responseResult, addresses.shipping);
    }
    if (addresses.website) {
        populateResponseResult('website', responseResult, addresses.website);
    }

    return responseResult;
}

/**
 *
 * list distributor's billing, home, shipping, website addresses
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context,
        userDao = daos.createDao('User', context),
        userId =  (request.params.userId === undefined) ? context.user.userId : parseInt(request.params.userId, 10),
        types = request.query.types,
        error,
        billing,
        home,
        shipping,
        website;

    billing = home = shipping = website = true;

    if (types) {
        types = types.toLowerCase();
        billing = (types.indexOf('billing') !== -1);
        home = (types.indexOf('home') !== -1);
        shipping = (types.indexOf('shipping') !== -1);
        website = (types.indexOf('website') !== -1);
    }

    if ((billing || home || shipping || website) === false) {
        error = new Error("address type is empty");
        error.statusCode = 400;
        next(error);
        return;
    }

    async.waterfall([
        function (callback) {
            userDao.getById(userId, callback);
        },

        function (user, callback) {
            userDao.getAddressesOfUser(user, callback);
        }
    ], function (error, addressesResult) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(addressesResult));
    });
}

module.exports = list;

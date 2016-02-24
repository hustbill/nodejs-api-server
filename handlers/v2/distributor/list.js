// GET /v2/distributors?first-name=<firstName>&last-name=<lastName>

var async = require('async');
var u = require('underscore');
var daos = require('../../../daos');
var mapper = require('../../../mapper');
var zipCodeService = require('../../../lib/zipwiseService');


function searchDistributorOptions(context, options, callback) {
    // if (!options.firstName && !options.lastName && !options.city && !options.zipCode && !options.stateId &&)
    if (!options.countryId){
        error = new Error("invalid parameters");
        error.errorCode = 'InvalidParams';
        error.statusCode = 400;
        callback(error);
        return;
    }

    var zipCodes = [];

    async.waterfall([
        function(callback) {
            if (u.isString(options.zipCode) && options.zipCode.trim().length > 0) {
                zipCodeService.queryZipcode(context, options.zipCode, function(error, result) {
                    zipCodes = result;
                    callback();
                    return;
                });

            } else {
                callback();
            }
        },
        function(callback) {
            var addressDao = daos.createDao('Address', context);
            var searchAddressOptions = {
                    firstName: options.firstName,
                    lastName: options.lastName,
                    stateId: options.stateId,
                    countryId: options.countryId,
                    city: options.city,
                    zipCodes: zipCodes,
                    roleCode: 'D'
                };

            addressDao.searchHomeAddress(searchAddressOptions, callback);
        },

        function(addresses, callback) {
            var distributors = addresses.map(function(address) {
                return {
                    id: address.distributor_id,
                    login: address.login,
                    address: address
                };
            });

            callback(null, distributors);
        }
    ], callback);
}

function searchDistributorByCustomerId(context, customerId, callback) {
    var userDao = daos.createDao('User', context),
        distributor,
        user;

    async.waterfall([

        function(callback) {
            var distributorDao = daos.createDao('Distributor', context);
            distributorDao.getDistributorByCustomerId(customerId, callback);
        },

        function(result, next) {
            distributor = result;

            if (!distributor) {
                var error = new Error('invalid distributor');
                callback(error);
                return;
            }

            userDao.getById(distributor.user_id, next);
        },

        function(result, callback) {

            if(!result || result.status_id !== 1){
                var error = new Error('invalid userId');
                callback(error);
                return;
            }

            user = result;
            userDao.getHomeAddressOfUser(user, callback);
        },

        function(address, callback) {
            callback(null, [{
                id: distributor.id,
                login: user.login,
                address: address
            }]);
        }
    ], callback);
}

function searchDistributor(context, options, callback) {
    if (options.customerId) {
        searchDistributorByCustomerId(context, options.customerId, callback);
    } else {
        searchDistributorOptions(context, options, callback);
    }
}

function mapAddress(address) {
    if (!address) {
        return null;
    }

    return {
        'first-name': address.firstname,
        m: address.middleabbr || '',
        'last-name': address.lastname,
        city: address.city || '',
        zip: address.zipcode || '',
        state: address.state_name || '',
        'state-id': address.state_id || undefined,
        country: address.country_name,
        'country-id': address.country_id || undefined
    };
}

function getRequestOptions(request) {
    var query = request.query;

    return {
        firstName: query['first-name'],
        lastName: query['last-name'],
        zipCode: query['zip-code'],
        city: query.city,
        stateId: query['state-id'],
        customerId: query['customer-id'],
        countryId: query['country-id']
    };
}

function generateResponse(distributors) {
    var result = {
        statusCode: 200
    };

    result.body = distributors.map(function(distributor) {
        return {
            'distributor-id': distributor.id,
            login: distributor.login,
            address: mapAddress(distributor.address)
        };
    });

    return result;
}

/**
 * Search distributors with first name and last name
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        searchDistributorOptions = getRequestOptions(request),
        error;


    async.waterfall([
        function(callback) {
            if (searchDistributorOptions.stateId) {
                request.check('state-id', 'state-id must be int').notEmpty().isInt();
                searchDistributorOptions.stateId = parseInt(searchDistributorOptions.stateId, 10);
            }

            var errors = request.validationErrors();
            if (errors && errors.length > 0) {
                error = new Error(errors[0].msg);
                error.statusCode = 400;
                return callback(error);
            }

            callback();

        },


        function(callback) {
            searchDistributor(context, searchDistributorOptions, callback);
        },


    ], function(error, result) {
        if (error) {
            next({
                body: []
            });
            return;
        }

        next(generateResponse(result));
    });

}

module.exports = get;
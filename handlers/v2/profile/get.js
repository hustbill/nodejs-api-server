// GET /v2/profile

var async = require('async');
var daos = require('../../../daos');

var utils = require('../../../lib/utils');

function getProfileByDistributorId(context, distributorId, callback) {
    var profile = {},
        userDao,
        distributor,
        homeAddress,
        user;

    async.waterfall([
        function (next) {
            var distributorDao = daos.createDao('Distributor', context);
            distributorDao.getById(distributorId, function (error, result) {
                if (error) {
                    if (error.errorCode === 'DistributorNotFound') {
                        callback(null, profile);
                        return;
                    }

                    callback(error);
                    return;
                }

                distributor = result;

                profile.distributor_id = distributor.id;
                profile.lifetime_rank = distributor.lifetime_rank;
                profile.next_renewal_date = distributor.next_renewal_date;
                profile.special_distributor_next_renewal_date = distributor.special_distributor_next_renewal_date;
                profile.birth_date = distributor.date_of_birth;
                profile.ssn = distributor.social_security_number;
                profile.company = distributor.company;
                profile.customer_id = distributor.customer_id;
                profile.taxnumber_exemption = distributor.taxnumber_exemption;

                next();
            });
        },

        function (callback) {
            var packtypeDao = daos.createDao('Packtype', context),
                packtypeId = Math.max(distributor.packtype_id, distributor.lifetime_packtype_id);

            profile.packtype_id = packtypeId;
            packtypeDao.getById(packtypeId, function (error, packtype) {
                if (error) {
                    callback();
                    return;
                }

                profile.packtype_name = packtype.name;
                callback();
            });
        },

        function (next) {
            userDao = daos.createDao('User', context);
            userDao.getById(distributor.user_id, function (error, result) {
                if (error) {
                    if (error.errorCode === 'UserNotFound') {
                        callback(null, profile);
                        return;
                    }

                    callback(error);
                    return;
                }

                user = result;

                profile.user_id = user.id;
                profile.login = user.login;
                profile.email = user.email;
                profile.registration_date = user.entry_date;

                next();
            });
        },

        function (callback) {
            userDao.getRolesOfUser(user, function (error, roles) {
                if (error) {
                    callback(error);
                    return;
                }

                if (roles && roles.length) {
                    var role = roles[0];
                    profile.role_name = role.name;
                    profile.role_code = role.role_code;
                }

                callback();
            });
        },

        function (callback) {
            userDao.getHomeAddressOfUser(user, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                homeAddress = result;

                if (homeAddress) {
                    profile.name = daos.User.getFullNameByHomeAddress(homeAddress);
                }

                callback();
            });
        },

        function (callback) {
            profile.localization = {};

            if (!homeAddress) {
                callback();
                return;
            }

            var countryDao = daos.createDao('Country', context),
                localization = profile.localization;
            countryDao.getCountryById(homeAddress.country_id, function (error, country) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!country) {
                    callback();
                    return;
                }

                localization['country-id'] = country.id;
                localization['country-iso'] = country.iso;

                var currencyDao = daos.createDao('Currency', context);
                currencyDao.getCurrencyById(country.currency_id, function (error, currency) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!currency) {
                        callback();
                        return;
                    }

                    localization['currency-code'] = currency.iso_code;
                    localization['currency-symbol'] = currency.symbol;
                    callback();
                });
            });
        },

        function (callback) {
            var assetDao = daos.createDao('Asset', context);
            assetDao.getAvatarAssetByUserId(user.id, function (error, asset) {
                if (error) {
                    callback(error);
                    return;
                }

                if (asset) {
                    profile.image_id = asset.id;
                    profile.image_url = asset.attachment_file_name;
                }

                callback(null, profile);
            });
        }
    ], callback);
}

/**
 * convert the database result rows into response object.
 *
 * @method generateResponse
 */
function generateResponse(profile, distributorId, websiteUrl, sponsorInfo) {
    var result = { statusCode : 200 };

    if (sponsorInfo.length !== 0) {
        sponsorInfo = sponsorInfo[0];
    }

    result.body = {
        'user-id' : profile.user_id,
        name : profile.name,
        login : profile.login,
        email : profile.email,
        'distributor-id' : profile.distributor_id,
        'registration-date' : profile.registration_date,
        'next-renewal-date' : profile.next_renewal_date,
        'special-distributor-next-renewal-date': profile.special_distributor_next_renewal_date,
        'birth-date': profile.birth_date,
        'lifetime-rank'  : profile.lifetime_rank,
        ssn : profile.ssn,
        company : profile.company,
        'taxnumber-exemption': profile.taxnumber_exemption,
        'customer-id': profile.customer_id,
        'packtype-id' : profile.packtype_id,
        'packtype-name' : profile.packtype_name,
        'role-name' : profile.role_name,
        'role-code' : profile.role_code,
        'image-url' : utils.generateUserAvatarUrl(profile.image_id, profile.image_url, websiteUrl),
        localization : profile.localization,
        'unilevel-parent-id' : sponsorInfo.id || null,
        'unilevel-parent-name' : [sponsorInfo.firstname, sponsorInfo.lastname].join(' ') || null,
        'unilevel-parent-email' : sponsorInfo.email || null,
        'unilevel-parent' : {
            id : sponsorInfo.id || null,
            name : [sponsorInfo.firstname, sponsorInfo.lastname].join(' ') || null,
            email : sponsorInfo.email || null,
            phone : sponsorInfo.phone || null
        }
    };
    return result;
}

/**
 * Return user profile json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        distributorId = context.user.distributorId,
        responseResult,
        distributorDAO = daos.createDao('Distributor', context),
        sponsorInfo,
        profile;

    async.waterfall([
        function(callback) {
            getProfileByDistributorId(
                context,
                distributorId,
                callback
            );
        },
        function(rows, callback){
            profile = rows;
            distributorDAO.getSponsorNameAndEmailByDistributorId(profile.distributor_id, callback);
        }
    ], function(error, result) {
        if (error) {
            next(error);
            return;
        }

        sponsorInfo = result;

        try {
            var websiteUrl = context.config.websiteUrl;
            responseResult = generateResponse(profile, distributorId, websiteUrl, sponsorInfo.rows);
        } catch (exception) {
            next(exception);
            return;
        }

        next(responseResult);
    });
}

module.exports = get;

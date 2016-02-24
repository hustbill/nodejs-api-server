// GET /v2/admin/users/:userId/profile

var async = require('async');
var daos = require('../../../../../daos');

// Constants
var DEFAULT_IMAGE_URL = '/images/nopic_mini.jpg';
var IMAGE_URL_PREFIX = '/upload/avatar/';

function getImageUrl(id, attachmentFilename, websiteUrl) {
    if (id && attachmentFilename) {
        return websiteUrl + IMAGE_URL_PREFIX + id + '/small_' + attachmentFilename;
    }
    return websiteUrl + DEFAULT_IMAGE_URL;
}

function getProfileByUserId(context, userId, callback) {
    var profile = {},
        userDao,
        user;

    async.waterfall([

        function (next) {
            userDao = daos.createDao('User', context);
            userDao.getById(userId, function (error, result) {
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

        function (next) {
            var distributorDao = daos.createDao('Distributor', context);
            distributorDao.getDistributorByUserId(user.id, function (error, distributor) {
                if (error) {
                    if (error.errorCode === 'DistributorNotFound') {
                        callback(null, profile);
                        return;
                    }

                    callback(error);
                    return;
                }

                profile.distributor_id = distributor.id;
                profile.next_renewal_date = distributor.next_renewal_date;
                profile.special_distributor_next_renewal_date = distributor.special_distributor_next_renewal_date;
                profile.birth_date = distributor.date_of_birth;
                profile.ssn = distributor.social_security_number;
                profile.taxnumber_exemption = distributor.taxnumber_exemption;
                profile.company = distributor.company;
                profile.packtype_id = distributor.packtype_id;
                profile.dualteam_sponsor_distributor_id = distributor.dualteam_sponsor_distributor_id;
                profile.dualteam_position = distributor.dualteam_current_position;
                profile.unilevel_sponsor_distributor_id = distributor.personal_sponsor_distributor_id;
                profile.customer_id = distributor.customer_id;

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
            userDao.getHomeAddressOfUser(user, function (error, homeAddress) {
                if (error) {
                    callback(error);
                    return;
                }

                if (homeAddress) {
                    profile.name = homeAddress.firstname + ' ' + homeAddress.lastname;
                }

                callback();
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
function generateResponse(profile, websiteUrl) {
    var result = { statusCode : 200 };

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
        ssn : profile.ssn,
        'taxnumber-exemption': profile.taxnumber_exemption,
        company : profile.company,
        'packtype-id' : profile.packtype_id,
        'enrollment-status' : profile.packtype_id,
        'dualteam-sponsor-distributor-id' : profile.dualteam_sponsor_distributor_id,
        'dualteam-position' : profile.dualteam_position,
        'unilevel-sponsor-distributor-id' : profile.unilevel_sponsor_distributor_id,
        'role-name' : profile.role_name,
        'role-code' : profile.role_code,
        'image-url' : getImageUrl(profile.image_id, profile.image_url, websiteUrl),
        'customer-id' : profile.customer_id
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
        userId = parseInt(request.params.userId, 10),
        responseResult;

    getProfileByUserId(
        context,
        userId,
        function (error, profile) {
            if (error) {
                next(error);
                return;
            }
            try {
                var websiteUrl = context.config.websiteUrl;
                responseResult = generateResponse(profile, websiteUrl);
            } catch (exception) {
                next(exception);
            }
            next(responseResult);
        }
    );
}

module.exports = get;

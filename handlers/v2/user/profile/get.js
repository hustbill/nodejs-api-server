// GET /v2/users/profile?login=<login>

var async = require('async');
var daos = require('../../../../daos');

// Constants
var DEFAULT_IMAGE_URL = '/images/nopic_mini.jpg';
var IMAGE_URL_PREFIX = '/upload/avatar/';

function getImageUrl(id, attachmentFilename, websiteUrl) {
    if (id && attachmentFilename) {
        return websiteUrl + IMAGE_URL_PREFIX + id + '/small_' + attachmentFilename;
    }
    return websiteUrl + DEFAULT_IMAGE_URL;
}

/**
* options = {
*    context:
*    login:
*    userId:   
* }
*
*/
function getProfile(options, callback) {
    var context = options.context,
        login = options.login,
        userId = options.userId,
        profile = {},
        userDao,
        distributor,
        user;

    async.waterfall([
        function (callback) {
            userDao = daos.createDao('User', context);
            userDao.getUserByOptions({
                    login: login,
                    userId: userId
                }, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                user = result;
                if (!user) {
                    error = new Error("User with login '" + login + "' or id '"+userId+"' does not exist.");
                    error.errorCode = 'InvalidLoginOrId';
                    error.statusCode = 404;
                    callback(error);
                    return;
                }

                profile.email = user.email;
                profile.userId = user.id;
                profile.login = user.login;
                callback();
            });
        },

        function (callback) {
            var distributorDao = daos.createDao('Distributor', context);
            distributorDao.getDistributorByUserId(user.id, function (error, result) {
                if (error) {
                    if (error.errorCode === 'DistributorNotFound') {
                        error.statusCode = 404;
                    }

                    callback(error);
                    return;
                }

                distributor = result;

                profile.distributor_id = distributor && distributor.id;
                profile.customer_id = distributor && distributor.customer_id;

                callback();
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
            userDao.getHomeAddressOfUser(user, function (error, address) {
                if (error) {
                    callback(error);
                    return;
                }

                if (address) {
                    profile.firstname = address.firstname;
                    profile.lastname = address.lastname;
                    profile.phone = address.phone;
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
        'first-name' : profile.firstname,
        'last-name' : profile.lastname,
        email : profile.email,
        login : profile.login,
        'user-id' : profile.userId,
        'distributor-id' : profile.distributor_id,
        'customer-id' : profile.customer_id,
        'role-name' : profile.role_name,
        'role-code' : profile.role_code,
        'image-url' : getImageUrl(profile.image_id, profile.image_url, websiteUrl)
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
        login = request.query.login,
        userId = request.query.userId,
        responseResult,
        error;

    if (!login && !userId) {
        error = new Error("Parameter 'login' or 'userId' is required.");
        error.errorCode = 'InvalidLoginOrId';
        error.statusCode = 400;
        next(error);
    }

    if(userId && /^\d+$/.test(userId)){
        userId = parseInt(userId, 10);
    }

    getProfile({
        context: context,
        login: login,
        userId: userId
    },
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

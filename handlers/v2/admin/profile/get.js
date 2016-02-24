// GET /v2/admin/profile

var async = require('async');
var daos = require('../../../../daos');

// Constants
var DEFAULT_IMAGE_URL = '/images/nopic_mini.jpg';
var IMAGE_URL_PREFIX = '/upload/avatar/';


function getProfileByUserId(context, userId, callback) {
    var profile = {},
        userDao,
	user;

    async.waterfall([
	function (callback) {
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
function generateResponse(profile) {
    var result = { statusCode : 200 };

    result.body = {
        'user-id' : profile.user_id,
        login : profile.login,
        email : profile.email,
        'role-name' : profile.role_name,
        'role-code' : profile.role_code
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
        userId = context.user.userId,
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
		responseResult = generateResponse(profile);
	    } catch (exception) {
		next(exception);
	    }
	    next(responseResult);
	}
     );
}

module.exports = get;
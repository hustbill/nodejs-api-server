/**
 * Get sponsor by distributor id
 */

var async = require('async');
var daos = require('../../../../daos');


function callbackSponsorNotFoundError(key, callback) {
    var error = new Error('Sponsor \'' + key + '\' was not found.');
    error.errorCode = 'SponsorNotFound';
    error.statusCode = 404;
    callback(error);
}

/**
 * get sponsor info
 * @param  {object}   options
 *    options:
 *        context:
 *        distributorId:
 *        login:
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
function getSponsorInfo(options, callback) {
    var context = options.context;
    var distributorId = options.distributorId;
    var login = options.login;
    var userData;

    var distributorDao = daos.createDao('Distributor', context);
    var userDao = daos.createDao('User', context);

    async.waterfall([
        function(callback){
            if(!login){
                callback(null, null);
                return;
            }
            userDao.getUserByLogin(login, callback);
        },
        function(user, callback){
            if(!login){
                callback();
                return;
            }

            if(!user){
                callbackSponsorNotFoundError(login, callback);
                return;
            }
            userData = user;
            callback();

        },
        function (callback) {
            var funName = 'getById';
            var funParam = distributorId;
            if(userData){
                funName = 'getDistributorByUserId';
                funParam = userData.id;
            }

            distributorDao[funName](funParam, function (error, distributor) {
                if (error) {
                    if (error.errorCode === 'DistributorNotFound') {
                        callbackSponsorNotFoundError(distributorId, callback);
                        return;
                    }

                    callback(error);
                    return;
                }
                distributorId = distributor.id;
                callback(null, distributor);
            });
        },

        function (distributor, callback) {
            distributorDao.canSponsorOthers(distributor, function (error, can) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!can) {
                    callbackSponsorNotFoundError(distributorId, callback);
                    return;
                }

                callback(null, distributor);
            });
        },

        function (distributor, callback) {
            if(userData){
                callback(null, userData);
                return;
            }

            userDao.getById(distributor.user_id, function (error, user) {
                if (error) {
                    if (error.errorCode === 'UserNotFound') {
                        callbackSponsorNotFoundError(distributorId, callback);
                        return;
                    }

                    callback(error);
                    return;
                }

                callback(null, user);
            });
        },

        function (user, callback) {
            userDao.getHomeAddressOfUser(user, function (error, homeAddress) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!homeAddress) {
                    callbackSponsorNotFoundError(distributorId, callback);
                    return;
                }

                callback(null, {
                    'distributor-id': distributorId,
                    name : homeAddress.firstname + ' ' + homeAddress.lastname,
                    'country-name': homeAddress.country_name || '',
                    'state-name': homeAddress.state_name || ''
                });
            });
        }
    ], callback);
}

function generateResult(sponsorInfo) {
    return {
        statusCode : 200,
        body : sponsorInfo || {}
    };
}

/**
 *
 * Get sponsor by distributorId or login
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context;
    var distributorIdOrLogin =request.params.distributorIdOrLogin;
    var getSponsorInfoOptions = {context: context};


    async.waterfall([
        function(callback) {
            if(!distributorIdOrLogin){
                callbackSponsorNotFoundError(distributorId, callback);
                return;
            }

            if(/\d+/.test(distributorIdOrLogin)){
                getSponsorInfoOptions.distributorId = parseInt(distributorIdOrLogin, 10);
            }else{
                getSponsorInfoOptions.login = distributorIdOrLogin;
            }
            callback();
        },
        function (callback) {
            getSponsorInfo(getSponsorInfoOptions, callback);
        }

    ], function (error, sponsorInfo) {
        if (error) {
            next(error);
            return;
        }

        next(generateResult(sponsorInfo));
    });
}

module.exports = get;

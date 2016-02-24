// GET /v2/admin/users/terminate/:userId

var async = require('async');
var daos = require('../../../../../daos');
var u = require('underscore');
  


/**
 * terminated user, only active user:
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get (request, response, next) {
    var context = request.context;
    var userId = parseInt(request.params.userId, 10);
    var userDao = daos.createDao('User', context);
    var distributorDao = daos.createDao('Distributor', context);
    var notes = 'terminate distributor';
    var STATUS_NAME_TERMINATE = 'Terminated';
    var error;
    var user;

    if(!u.isFinite(userId) || userId < 0 ){
        error = new Error('Invalid user-id');
        error.errorCode='InvalidUserId';
        error.statusCode = 400;
        next(error);
        return;
    }

    async.waterfall([
            function(callback){
                userDao.getById(userId, function(error, data) {
                    if(error) {
                        return callback(error);
                    }

                    if(!data) {
                        error = new Error('User does not exists, user-id:'+userId);
                        error.statusCode = 404;
                        return callback(error);
                    }

                    if(data.status_id !== 1){
                        error = new Error('User is not active, user-id:'+userId);
                        error.statusCode = 400;
                        return callback(error);
                    }
                    user = data;
                    callback();
                });
            },
            function(callback){
                userDao.getDistributorOfUser(user, callback);
            },
            function(distributor, callback){
                userDao.setStatusOfUserByStatusName(user, STATUS_NAME_TERMINATE, callback);
            },
            function(callback){
                userDao.isDistributor(user, callback);
            },
            function(isDistributor, callback){
                if(!isDistributor){
                    callback();
                    return;
                }
                 userDao.moveDownlines(context, user.distributor, notes, function(error) {
                    if (error) {
                        callback(error);
                        return;
                    }
                    callback();
                });
            },
            function(callback){
                distributorDao.disableToken(user.distributor.id, function (error) {
                    if(error) {
                        callback(error);
                        return;
                    }
                    callback();
                });
            },
            function(callback){

                if(context.companyCode !== 'MMD'){
                    callback();
                    return;
                }
                var forcedMatrixDao = daos.createDao('ForcedMatrix', context);
                forcedMatrixDao.removePosition({
                    distributorId: user.distributor.id,
                    notes: notes
                }, callback);

            }

        ], function(error, result){
            if(error){
                next(error);
                return;
            }
            next({
                statusCode:200,
                body:{status:'success'}
            });

    });
}



module.exports = get;
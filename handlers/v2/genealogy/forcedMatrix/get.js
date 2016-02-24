// GET /v2/genealogy/forced-matrix[?distributorId, login, level & position]

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');




function generateResponse(data, callback) {
    var result = {statusCode:200, body:[]};
    
    if(!u.isArray(data)){
        callback(null, result);
        return ;
    }

    u.each(data, function(item){
        result.body.push({
            'distributor-id': item.distributorId,
            'login': item.login,
            'position': item.position,
            'level': item.level,
            'first-name': item.firstname,
            'last-name': item.lastname,
            'role-code': item.roleCode,
            'sponsor-id': item.sponsorId,
            'is-downline': item.isDownline,
            'active': item.active,
            'image-url': utils.generateUserAvatarUrl(item.imageId, item.imageName)
        });
    });

    callback(result);
}

/**
 * Return forced matrix tree json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context;
    var sponsorId = context.user.distributorId;
    var distributorId = parseInt(request.query['distributor-id'], 10);
    var level = parseInt(request.query.level, 10);
    var position = parseInt(request.query.position, 10);
    var login = request.query.login;
    var forcedMatrixDAO = daos.createDao('ForcedMatrix', context);
    var error;
    
    async.waterfall([

        function(callback) {
            if(u.isFinite(level) && u.isFinite(position)){
                forcedMatrixDAO.getTreeByLevelAndPosition({sponsorId: sponsorId, level: level, position: position}, callback);
                return;
            }

            if(distributorId > 0){
                forcedMatrixDAO.getTreeByDistributorId({sponsorId: sponsorId, distributorId: distributorId}, callback);
                return;
            }

            if(login){
                forcedMatrixDAO.getTreeByLogin({sponsorId: sponsorId, login: login}, callback);
                return;
            }

            error = new Error('distributor-id or login or level, position is required');
            error.statusCode = 400;
            callback(error);

        },
        function(result, callback) {
            generateResponse(result, callback);
        }
    ], next);
}

module.exports = get;
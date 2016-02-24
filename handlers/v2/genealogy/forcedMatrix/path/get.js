// GET /v2/genealogy/forced-matrix/path[?distributorId, level & position]

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');




function generateResponse(data, callback) {
    var result = {statusCode:200, body:[]};
    
    if(!u.isArray(data)){
        callback(null, result);
        return ;
    }

    u.each(data, function(item){
        result.body.push({
            'distributor-id': item.distributorId,
            'position': item.position,
            'level': item.level
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
    var distributorId = parseInt(request.query['child-distributor-id'], 10);
    var level = parseInt(request.query.level, 10);
    var position = parseInt(request.query.position, 10);
    var forcedMatrixDAO = daos.createDao('ForcedMatrix', context);
    var error;

    async.waterfall([

        function(callback) {
            if(distributorId > 0 ){
                forcedMatrixDAO.getTreePathByDistributorId({sponsorId: sponsorId, distributorId: distributorId}, callback);
                return;
            }


            if(u.isFinite(level) && u.isFinite(position)){
                forcedMatrixDAO.getTreePathByLevelAndPosition({sponsorId: sponsorId, level: level, position: position}, callback);
                return;
            }
            error = new Error('child-distributor-id or level, position is required');
            error.statusCode = 400;
            callback(error);
        },
        function(result, callback) {
            generateResponse(result, callback);
        }
    ], next);
}

module.exports = get;
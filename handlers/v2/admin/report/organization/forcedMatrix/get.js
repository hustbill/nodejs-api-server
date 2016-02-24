var async = require('async');
var daos = require('../../../../../../daos');
var u = require('underscore');

function generateResponse(data){
    var result = {
            statusCode: 200,
            body: {
                meta: data.meta,
                data: []
            }
        };

    if (!u.isArray(data.data) || u.isEmpty(data.data)) {
        return result;
    }

    
    data.data.forEach(function(item) {
        result.body.data.push({
            'distributor-id': item.distributor_id,
            'distributor-name': item.distributor_name,
            'login-name':item.login,
            'role-code': item.role_code,
            'email': item.email,
            'level': item.level,
            'position': item.position,
            'active': item.active
        });
    });


    

    return result;
}
/**
 * Return report organization json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context;
    var logger = context.logger;
    var query = request.query;
    var distributorId = parseInt(query['distributor-id'], 10);
    var limit = parseInt(query.limit, 10);
    var offset = parseInt(query.offset, 10);
    var roleCode = query['role-code'];
    var error;

    var forcedMatrixDAO = daos.createDao('ForcedMatrix', context);
    var reportDAO = daos.createDao('Report', context);

    if(!limit || limit <= 0){
        limit = 25;
    }

    if(!offset || offset < 0){
        offset = 0;
    }
    

    if(!u.isFinite(distributorId)){
        distributorId = null;
    }

    if(context.companyCode !== 'MMD'){
        error = new Error('the company-code is invalid');
        error.statusCode = 403;
        next(error);
        return;
    }



    async.waterfall([
        function(callback){
            forcedMatrixDAO.getTopPosition(callback);
        },
        function(levelPostion, callback){
            if(!levelPostion){
                callback(null, {meta:{limit: limit, offset: offset, count:0}, data:[]});
                return;
            }

            reportDAO.getOrganizationForcedMatrix({
                level: levelPostion.level,
                position: levelPostion.position,
                limit: limit,
                offset: offset,
                childId: distributorId,
                roleCode: roleCode
            }, callback);
        }

    ], function(error, result){
        if(error){
            next(error);
            return;
        }

        next(generateResponse(result));
    });

}

module.exports = get;

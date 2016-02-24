'use strict';
var async = require('async');
var daos = require('../../../../../daos');
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
            'email': item.is_sponsored ? item.email : '',
            'phone': item.is_sponsored ? item.phone : '',
            'level': item.level,
            'position': item.position,
            'active': item.active,
            'is-sponsored': item.is_sponsored
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
    var distributorId = context.user.distributorId;
    var query = request.query;
    var childId = parseInt(query['child-distributor-id'], 10);
    var childLogin = query['child-login'];
    var limit = parseInt(query.limit, 10);
    var offset = parseInt(query.offset, 10);
    var roleCode = query['role-code'];
    var onlySponsored = query['only-sponsored'];
    var onlyActive = query['only-active'];
    var type = query.type; //metrix | unilevel
    var error;

    var forcedMatrixDAO = daos.createDao('ForcedMatrix', context);
    var reportDAO = daos.createDao('Report', context);

    if(!limit || limit <= 0){
        limit = 25;
    }

    if(!offset || offset < 0){
        offset = 0;
    }
    

    if(!u.isFinite(childId)){
        childId = null;
    }




    async.waterfall([
        function(callback){
            forcedMatrixDAO.getLevelAndPositionByDistributorId(distributorId, function(error, levelPostion){
                if(error){
                    callback(error);
                    return;
                }
                if(!levelPostion){
                     error = new Error('the organization report is not found by distributor id:' + distributorId);
                    error.statusCode = 404;
                    callback(error);
                    return;
                }

                callback(null, levelPostion);
            });
        },
        function(levelPostion, callback){
            var getOrganizationForcedMatrixOptions = {
                level: levelPostion.level,
                position: levelPostion.position,
                childId: childId,
                childLogin: childLogin,
                limit: limit,
                offset: offset,
                roleCode: roleCode,
                sponsorId: distributorId
            };
            if(onlySponsored){
                getOrganizationForcedMatrixOptions.onlySponsored = true;
            }
            if(onlyActive){
                getOrganizationForcedMatrixOptions.onlyActive = true;
            }
            if(type === 'unilevel'){
                getOrganizationForcedMatrixOptions.onlyUnilevel = true;
            }
            reportDAO.getOrganizationForcedMatrix(getOrganizationForcedMatrixOptions, callback);
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

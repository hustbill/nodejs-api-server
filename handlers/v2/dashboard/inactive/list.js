var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var u = require('underscore');
var moment = require('moment');


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
            'image-url': utils.generateUserAvatarUrl(item.imageId, item.imageName)
        });
    });


    

    return result;
}

function get(req, resp, next){
    var context = req.context;
    var logger= context.logger;
    var distributorId = context.user.distributorId;
    var period = req.query.period;
    var limit = parseInt(req.query.limit, 10);
    var offset = parseInt(req.query.offset, 10);

    if(!limit || limit <= 0){
        limit = 25;
    }

    if(!offset || offset < 0){
        offset = 0;
    }

    var dashboardDAO = daos.createDao('Dashboard', context);
        dashboardDAO.listInactiveDownline({
            distributorId: distributorId,
            period: period,
            limit: limit,
            offset: offset
        }, function(error, result){
            if(error){
                next(error);
                return;
            }

            next(generateResponse(result));
        });
}


module.exports = get;
var daos = require('../../../../../daos');
var u = require('underscore');

function generateResponse(result){
    return {statusCode:200, body:result};
}

function get(req, resp, next){
    var context = req.context,
        logger= context.logger;

    var dashboardDAO = daos.createDao('Dashboard', context);
        dashboardDAO.countUserByEnrollmentDate({
            distributorId: context.user.distributorId,
            roleCode:'D'
        }, function(error, result){
            if(error){
                next(error);
                return;
            }

            next(generateResponse(result));
        })
}


module.exports = get;
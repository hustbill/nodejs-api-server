var daos = require('../../../../daos');
var u = require('underscore');
var moment = require('moment');


function generateResponse(result){


    return {statusCode:200, body:result};
}

function get(req, resp, next){
    var context = req.context,
        logger= context.logger;

    var dashboardDAO = daos.createDao('Dashboard', context);
    dashboardDAO.getMonthlyCommissions({
        distributorId: context.user.distributorId
    }, function(error, result){
        if(error){
            next(error);
            return;
        }

        next(generateResponse(result));
    });
}


module.exports = get;

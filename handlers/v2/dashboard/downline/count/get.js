var daos = require('../../../../../daos');
var u = require('underscore');
var moment = require('moment');


function generateResponse(result){

    return {statusCode:200, body:result};
}

function get(req, resp, next){
    var context = req.context;
    var logger= context.logger;
    var distributorId = context.user.distributorId;

    var dashboardDAO = daos.createDao('Dashboard', context);
        dashboardDAO.countDownline({
            distributorId: distributorId
        }, function(error, result){
            if(error){
                next(error);
                return;
            }

            next(generateResponse(result));
        });
}


module.exports = get;
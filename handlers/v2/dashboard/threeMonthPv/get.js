var daos = require('../../../../daos');
var u = require('underscore');
var moment = require('moment');


function generateResponse(result){


    return {statusCode:200, body:result};
}

function get(req, resp, next){
    var context = req.context,
        logger= context.logger,
        error;


    if('BEB' !== context.companyCode){
        error = new Error("invalid company-code");
        next(error);
        return;
    }

    var dashboardDAO = daos.createDao('Dashboard', context);
    dashboardDAO.getThreeMonthPV({
        distributorId: context.user.distributorId
    }, function(error, result){
        if(error){
            next(error);
            return;
        }

        next(generateResponse({
        'three-month-pv': result
     }));
    });
}


module.exports = get;
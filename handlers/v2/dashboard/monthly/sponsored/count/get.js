var daos = require('../../../../../../daos');
var u = require('underscore');
var moment = require('moment');


function generateResponse(result){

    return {statusCode:200, body:result};
}

function get(req, resp, next){
    var context = req.context;
    var logger= context.logger;
    var distributorId = context.user.distributorId;
    var respBody = {};

    var dashboardDAO = daos.createDao('Dashboard', context);
        dashboardDAO.countMonthlySponsoredUser({
            distributorId: distributorId
        }, function(error, result){
            if(error){
                next(error);
                return;
            }

            respBody['sponsored-count'] = result;

            if(context.companyCode === 'MMD'){
                respBody['requires-sponsor'] = {
                    'bonus-qualified': 2,
                    'matching-bonus': 8,
                    'medicus-treasury-chest': 14
                };
            }

            next(generateResponse(respBody));
        });
}


module.exports = get;
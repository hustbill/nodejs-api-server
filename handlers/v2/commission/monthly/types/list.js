// GET /v2/commissions/monthly/types
var u = require('underscore');
var daos = require('../../../../../daos');


function generateResponse(data) {
    var result = {
        statusCode: 200,
        body: []
    };

    if(!u.isArray(data) || u.isEmpty(data)){
        return result;
    }


    data.forEach(function(item) {
        result.body.push({
            // id:item.id,
            name: item.name,
            code: item.code,
            period: item.period,
            'multi-line': item.multi_line
        });
    });

    return result;
}


/**
 * Return monthly commission type
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        result;

    var commissionTypeDAO = daos.createDao('CommissionType', context);

    commissionTypeDAO.getTypesByPeriod('monthly', function(error, types) {
        next(generateResponse(types));
    });
}

module.exports = get;
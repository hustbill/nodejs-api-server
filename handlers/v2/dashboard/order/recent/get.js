var daos = require('../../../../../daos');
var u = require('underscore');
var moment = require('moment');


function generateResponse(result){
    var respBody = {statusCode:200, body:[]};

    u.map(result, function(item){
        respBody.body.push({
            'order-number': item.order_number,
            'state': item.state,
            'order-total': item.order_total,
            'payment-total': item.payment_total,
            'order-date': moment(item.order_date).format("YYYY-MM-DD HH:mm"),
            'commission-period': moment(item.completed_at) ? moment(item.completed_at).format("YYYY-MM") : '',
            'commission-volume': item.commission_volume,
            'role-code': item.role_code
        });
    });

    return respBody;
}

function get(req, resp, next){
    var context = req.context,
        logger= context.logger;

    var dashboardDAO = daos.createDao('Dashboard', context);
    dashboardDAO.getRecentOrders({
        distributorId: context.user.distributorId
    }, function(error, result){
        if(error){
            next(error);
            return;
        }

        next(generateResponse(result));
    })
}


module.exports = get;
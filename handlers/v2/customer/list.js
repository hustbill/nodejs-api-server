// GET /v2/customers/users

var async = require('async');
var u = require('underscore');
var daos = require('../../../daos');

function generateResponse(data) {
    var result = {
            statusCode: 200,
            body: {
                meta: data.meta,
                data: []
            }
        };

    data.data.forEach(function(item){
        result.body.data.push({
            'distributor-id': item.id,
            'first-name': item.firstname || '',
            'last-name': item.lastname || '',
            'country': item.country || '',
            'state': item.state || '',
            'city': item.city || '',
            'zip-code': item.zipcode || '',
            'address': item.address || '',
            'address2': item.address2 || '',
            'address_id': item.address_id ,
            'country_id': item.country_id ,
            'state_id': item.state_id ,
            'phone': item.phone || '',
            'email': item.email,
            'enrollment-date': item.enrollment_date
        });
    });

    return result;
}

/**
 * Query retail customer
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context,
        logger = context.logger,
        sponsorId = context.user.distributorId,
        customerId = request.query['distributor-id'],
        userName = request.query['user-name'],
        offset = request.query.offset,
        limit = request.query.limit,
        status = request.query.status,
        roleCode = request.query['role-code'],
        error;

    
    var customerDAO = daos.createDao('Customer', context);

    async.waterfall([

        function(callback) {
            if (offset) {
                request.check('offset', 'offset must be int').notEmpty().isInt();
                offset = parseInt(offset, 10);
            } else {
                offset = 0; //default
            }

            if (limit) {
                request.check('limit', 'limit must be int').notEmpty().isInt();
                limit = parseInt(limit, 10);
            } else {
                limit = 25; //default
            }

            if(status){
                status = status.trim().toLowerCase();
                if(['active', 'inactive'].indexOf(status) < 0){
                    error = new Error('invalid status:'+ status);
                    error.statusCode = 400;
                    return callback(error);
                }
            }else{
                status = 'active';
            }

            if(roleCode){
                roleCode = roleCode.trim().toUpperCase();
                if(['R', 'D'].indexOf(roleCode) < 0){
                    error = new Error('invalid role-code:'+ roleCode);
                    error.statusCode = 400;
                    return callback(error);
                }
            }else{
                roleCode = 'R';
            }

            var errors = request.validationErrors();
            if (errors && errors.length > 0) {
                error = new Error(errors[0].msg);
                error.statusCode = 400;
                return callback(error);
            }

            callback();

        },
        function(callback) {

            customerDAO.getCustomers({
                sponsorId: sponsorId,
                customerId: customerId,
                userName: userName,
                status: status,
                roleCode: roleCode,
                limit: limit,
                offset: offset,
                orderByEnrollmentDate: true,
            }, callback);
        }
    ], function(error, result) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(result));
    });
}

module.exports = list;
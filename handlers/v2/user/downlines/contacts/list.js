// GET /v2/users/downlines/contacts

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');

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
            'level': item.level,
            'role-code': item.role_code,
            'lifetime-rank': item.lifetime_rank,
            'lifetime-rank-name': item.lifetime_rank_name || '',
            'first-name': item.firstname || '',
            'last-name': item.lastname || '',
            'country': item.country || '',
            'state': item.state || '',
            'city': item.city || '',
            'zip-code': item.zipcode || '',
            'address': item.address || '',
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
        offset = request.query.offset,
        limit = request.query.limit,
        lifetimeRanks = request.query['lifetime-ranks'],
        error;

    
    var userDAO = daos.createDao('User', context);

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

            if(u.isString(lifetimeRanks)){
                try{
                    lifetimeRanks = JSON.parse(lifetimeRanks);
                }catch(e){
                    logger.warn('error from decode json string for lifetime-ranks');
                   lifetimeRanks = null; 
                }
            }else{
                lifetimeRanks = null;
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

            userDAO.listDownlineContacts({
                sponsorId: sponsorId,
                roleCode: 'D',
                lifetimeRanks: lifetimeRanks,
                limit: limit,
                offset: offset
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
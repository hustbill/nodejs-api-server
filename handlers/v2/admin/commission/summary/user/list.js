// GET /v2/admin/commissions/summary/users

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../../daos');

function generateResponse(data) {
    var temp,
        type = data.type || {},
        result = {
            statusCode: 200,
            body: {
                meta: data.meta,
                data: []
            }
        };

    if (!u.isArray(data.data) || u.isEmpty(data.data)) {
        return result;
    }

    data.data.forEach(function(item){
        temp = {
            'distributor-id': item.distributor_id,
            'name': '',
            total: item.total
        };

        if(u.isString(item.overview)){
            try{
                item.overview = JSON.parse(item.overview);
                if(u.isArray(item.overview) && !u.isEmpty(item.overview)){
                    temp.name = item.overview[0]; // TODO:
                }
            }catch(e){

            }
        }
        
        if(temp.name === '' && u.isString(item.details)){
            try{
                item.details = JSON.parse(item.details);
                if(u.isArray(item.details) && !u.isEmpty(item.details)){
                    temp.name = item.details[0]; // TODO:
                }
            }catch(e){

            }
        }
        
        result.body.data.push(temp);
    });

    return result;
}

/**
 * Return monthly commission summary
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        logger = context.logger,
        config = context.config || {},
        application = config.application || {},
        commissionSettings = application.commissions || {},
        offset = request.query.offset,
        limit = request.query.limit,
        date = request.query.date,
        countryId = request.query['country-id'],
        error;

    var commissionDAO = daos.createDao('Commission', context);

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

            if (countryId) {
                request.check('country-id', 'country-id must be int').notEmpty().isInt();
                countryId = parseInt(countryId, 10);
            }

            request.check('date', 'date must be YYYYMMDD').notEmpty().len(8);

            var errors = request.validationErrors();
            if (errors && errors.length > 0) {
                error = new Error(errors[0].msg);
                error.statusCode = 400;
                return callback(error);
            }

            callback();

        },

        function(callback) {
            commissionDAO.listUserCommissionSummary({
                date: date,
                countryId: countryId,
                limit: limit,
                offset: offset
            }, callback);
        },
        
    ], function(error, result) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(result));
    });
}

module.exports = get;
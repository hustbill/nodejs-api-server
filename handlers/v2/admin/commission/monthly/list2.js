// GET /v2/admin/commissions/monthly2

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');
var cacheHelper = require('../../../../../lib/cacheHelper');
var cacheKey = require('../../../../../lib/cacheKey');

function generateResponse(data) {
    var temp,
        types = data.types || [],
        result = {
            statusCode: 200,
            body: {
                meta: {
                    offset: data.meta.offset,
                    limit: data.meta.limit,
                    count: data.meta.count
                },
                overview: [{
                    name: "Total",
                    value: data.meta.sum_commission
                }],
                data: {
                    names: ["Distributor ID", "Distributor Name"],
                    values: []
                }
            }
        };

    types.forEach(function(item){
        result.body.data.names.push(item.name);
    });
    result.body.data.names.push("Total");

    if (!u.isArray(data.data) || u.isEmpty(data.data)) {
        return result;
    }

    
    data.data.forEach(function(item) {
        result.body.data.values.push(u.values(item));
    });


    

    return result;
}

/**
 * Return monthly unilevel commission
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
        date = request.query.date,
        offset = request.query.offset,
        limit = request.query.limit,   
        countryId = request.query['country-id'], 
        commissionTypes,    
        error;

    var commissionTypeDAO = daos.createDao('CommissionType', context);
    var commissionDAO = daos.createDao('Commission', context);
    var rankDAO = daos.createDao('ClientRank', context);

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
        //refresh-cache
        function(callback){
            if(request.query['refresh-cache']){
                async.parallel([
                    async.apply(cacheHelper.del, context, cacheKey.monthlyCommission2Count(date, countryId)),
                    async.apply(cacheHelper.del, context, cacheKey.monthlyCommission2Sum(date, countryId)),
                    async.apply(cacheHelper.del, context, cacheKey.monthlyCommission2LimitOffset(date, countryId, limit, offset)),
                ], function (err, results) {
                    callback();
                });
            }else{
                callback();
            }
            
        },

        function(callback){
            commissionTypeDAO.getAllTypes(function(error, dataArr){

                commissionTypes = dataArr;
                callback(); 
               
            });
        },

        function(callback) {

            commissionDAO.getMonthlyCommission2({
                typeCnt: u.isArray(commissionTypes) ? commissionTypes.length : 0,
                date: date,
                countryId: countryId,
                offset: offset,
                limit: limit
            }, callback);
        },
       
    ], function(error, result) {
        if (error) {
            next(error);
            return;
        }

        result.types = commissionTypes;

        next(generateResponse(result));
    });
}

module.exports = get;
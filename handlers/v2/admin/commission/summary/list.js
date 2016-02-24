// GET /v2/admin/commissions/summary

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');

function generateResponse(data) {
    var temp,
        type = data.type || {},
        result = {
            statusCode: 200,
            body: []
        };

    if (!u.isArray(data) || u.isEmpty(data)) {
        return result;
    }

    data.forEach(function(item){
        result.body.push({
            name: item.name,
            code: item.code,
            period: item.period,
            total: item.total,
            count: item.count
        });
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
        date = request.query.date,
        countryId = request.query['country-id'],
        error;

    var commissionDAO = daos.createDao('Commission', context);

    async.waterfall([

        function(callback) {
          
            request.check('date', 'date must be YYYYMMDD').notEmpty().len(8);

            if (countryId) {
                request.check('country-id', 'country-id must be int').notEmpty().isInt();
                countryId = parseInt(countryId, 10);
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
            commissionDAO.getCommissionSummary({
                date: date,
                countryId: countryId
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
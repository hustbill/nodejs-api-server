// GET /v2/commissions/summary/:distributorId

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');

function generateResponse(distributorId, data) {
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
            'multi-line': item.multi_line,
            total: item.total
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
        distributorId = request.params.distributorId,
        date = request.query.date,
        error;

    var commissionDAO = daos.createDao('Commission', context);

    async.waterfall([

        function(callback) {
          
            request.check('date', 'date must be YYYYMMDD').notEmpty().len(8);
            request.check('distributorId', 'distributorId must be number').notEmpty().isInt();

            var errors = request.validationErrors();
            if (errors && errors.length > 0) {
                error = new Error(errors[0].msg);
                error.statusCode = 400;
                return callback(error);
            }

            distributorId = parseInt(distributorId, 10);

            callback();

        },
        //permission check
        function(callback){
            if(distributorId === context.user.distributorId){
                callback();
                return;
            }

            var distributorDAO = daos.createDao('Distributor', context);
            distributorDAO.validateParentChildRelationshipUL({
                parentDistributorId : context.user.distributorId,
                childDistributorId : distributorId
            }, function(error, relationship){
                if(error){
                    callback(error);
                    return;
                }
                if(relationship === true){
                    callback();
                    return;
                }

                error = new Error("No permission to get data.");
                error.errorCode = "NoPermissionToGetData";
                error.statusCode = 403;
                callback(error);
            });
        },

        function(callback) {
            commissionDAO.getCommissionSummary({
                date: date,
                distributorId: distributorId
            }, callback);
        },
        
    ], function(error, result) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(distributorId, result));
    });
}

module.exports = get;
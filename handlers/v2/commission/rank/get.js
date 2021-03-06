// GET /v2/commissions/ranks?date=monthly-date
// GET /v2/admin/commissions/ranks/:distributorId

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');

function generateResponse(data) {
    var result = {
            statusCode: 200,
            body: []
        },
        item;

    if (!u.isArray(data.data) || u.isEmpty(data.data)) {
        return result;
    }

    item = data.data[0];

    result.body = {
            "distributor-id": item.distributor_id,
            "qualified-rank": item.paid_rank,
            "details": item.details,
            "next-rank-details": item.next_rank_details
        };

    return result;
}

/**
 * Return monthly commission rank json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        logger = context.logger,
        distributorId = context.user.distributorId,
        childDistributorId = request.query['child-distributor-id'],
        date = request.query.date,
        type = request.query.type,
        offset = request.query.offset,
        limit = request.query.limit,
        error;

    var rankDao = daos.createDao('ClientRank', context);
    var commissionDao = daos.createDao('Commission', context);

    async.waterfall([

        function(callback) {

            request.check('date', 'date must be YYYYMMDD').notEmpty().len(8);

            var errors = request.validationErrors();
            if (errors && errors.length > 0) {
                error = new Error(errors[0].msg);
                error.statusCode = 400;
                return callback(error);
            }

            callback();

        },

        function(callback){
            var distributorDAO = daos.createDao('Distributor', context);

            if(!childDistributorId){
               return callback(); 
            }

            childDistributorId = parseInt(childDistributorId, 10);
            distributorDAO.validateParentChildRelationshipUL({
                    parentDistributorId : distributorId,
                    childDistributorId : childDistributorId
                }, function(error, relationship){
                    if(error){
                        callback(error);
                        return;
                    }
                    if(relationship === true){
                        distributorId = childDistributorId;
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

            commissionDao.getCommissionRank2({
                distributorId: distributorId,
                date: date
            }, callback);
        },
        //get rank_name
        function(result, callback) {

            async.eachSeries(result.data,
                function(item, callback) {
                    if (item.paid_rank) {
                        rankDao.getRankById(item.paid_rank, function(error, rank) {

                            item.paid_rank = rank ? rank.name : '';
                            callback();
                        });
                        return;
                    }
                    callback();

                }, function(error) {
                    callback(null, result);
                });
        },
        //decode detail string
        function(result, callback) {

            async.eachSeries(result.data,
                function(item, callback) {
                    if (item.next_rank_details) {

                        var detailObj = item.next_rank_details;
                        var rankId = null;
                        try {
                            //
                            if (u.isEmpty(detailObj)) {
                                callback();
                                return;
                            }

                            var details = {};

                            for (rankId in detailObj) {
                                details.rank = rankId;
                                details.requirements = detailObj[rankId];
                                break;
                            }
                            rankDao.getRankById(rankId, function(error, rank) {

                                details.rank = rank ? rank.name : rankId;
                                item.next_rank_details = details;
                                callback();
                            });
                        } catch (exception) {
                            callback();
                        }

                        return;
                    }

                    callback();

                }, function(error) {
                    callback(null, result);
                });
        }
    ], function(error, result) {
        if (error) {
            next(error);
            return;
        }

        result.distributorId = distributorId;

        next(generateResponse(result));
    });
}

module.exports = get;
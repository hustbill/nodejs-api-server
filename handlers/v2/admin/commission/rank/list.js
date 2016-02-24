// GET /v2/admin/commissions/ranks

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');

function generateResponse(data) {
    var result = {
        statusCode: 200,
        body: {
            meta: data.meta,
            ranks: []
        }
    };


    data.data.forEach(function(item) {
        result.body.ranks.push({
            "distributor-id": item.distributor_id,
            "qualified-rank": item.paid_rank,
            "details": item.details,
            "next-rank-details": item.next_rank_details
        });
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
        date = request.query.date,
        offset = request.query.offset,
        limit = request.query.limit,
        countryId = request.query['country-id'],
        error;

    var rankDao = daos.createDao('ClientRank', context);
    var commissionDao = daos.createDao('Commission', context);

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


            commissionDao.getCommissionRank2({
                date: date,
                countryId: countryId,
                offset: offset,
                limit: limit
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

        next(generateResponse(result));
    });
}

module.exports = get;
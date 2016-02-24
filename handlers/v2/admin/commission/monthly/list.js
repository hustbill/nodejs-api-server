// GET /v2/admin/commissions/monthly

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');

function generateResponse(data) {
    var temp,
        type = data.type || {},
        result = {
            statusCode: 200,
            body: {
                "commission-name": type.name || '',
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
                    names: ["Distributor ID", "Commission"],
                    values: []
                }
            }
        };

    if (!u.isArray(data.data) || u.isEmpty(data.data)) {
        result.body.overview = [];
        result.body.data = {
            names: [],
            values: []
        };
        return result;
    }

    if (type.multi_line) {
        if (u.isObject(type.overview_fields) && !u.isEmpty(type.overview_fields)) {

            result.body.data.names = result.body.data.names.concat(type.overview_fields.displayNames || []);
            data.data.forEach(function(item) {
                temp = [item.distributor_id, item.commission];
                if (item.overview) {
                    temp = temp.concat(item.overview);
                }
                result.body.data.values.push(temp);

            });

        }

    } else {
        if (u.isObject(type.details_fields) && !u.isEmpty(type.details_fields)) {

            result.body.data.names = result.body.data.names.concat(type.details_fields.displayNames || []);
            data.data.forEach(function(item) {
                temp = [item.distributor_id, item.commission];
                if (item.details) {
                    temp = temp.concat(item.details);
                }
                result.body.data.values.push(temp);

            });

        }
    }



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
        typeCode = request.query['type-code'],
        offset = request.query.offset,
        limit = request.query.limit,
        commissionType = {},
        countryId = request.query['country-id'],
        error;

    var commissionTypeDAO = daos.createDao('CommissionType', context);
    var commissionDAO = daos.createDao('Commission', context);
    var rankDAO = daos.createDao('ClientRank', context);

    async.waterfall([

        function(callback) {

            commissionTypeDAO.getTypeByCode(typeCode, function(error, type) {
                if (error) {
                    callback(error);
                    return;
                }
                if (!type) {
                    error = new Error("type mismatch");
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                commissionType = type;

                callback();
            });


        },
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

            commissionDAO.getMonthlyCommission({
                typeId: commissionType.id,
                date: date,
                countryId: countryId,
                offset: offset,
                limit: limit
            }, callback);
        },
        //get overview rank_name
        function(result, callback) {

            if (!commissionType.overview_fields || !commissionType.overview_fields.keyNames || commissionType.overview_fields.keyNames.indexOf('paidRank') < 0) {
                callback(null, result);
                return;
            }

            var paidRankIndex = commissionType.overview_fields.keyNames.indexOf('paidRank');

            async.eachSeries(result.data,
                function(item, callback) {
                    if (item.overview && item.overview[paidRankIndex]) {
                        rankDAO.getRankById(item.overview[paidRankIndex], function(error, rank) {
                            item.overview[paidRankIndex] = rank ? rank.name : item.overview[paidRankIndex];
                            callback();
                        });
                        return;
                    }
                    callback();

                }, function(error) {
                    callback(null, result);
                });
        },
        //get detail rank_name
        function(result, callback) {

            if (!commissionType.details_fields || !commissionType.details_fields.keyNames || commissionType.details_fields.keyNames.indexOf('paidRank') < 0) {
                callback(null, result);
                return;
            }

            var paidRankIndex = commissionType.details_fields.keyNames.indexOf('paidRank');

            async.eachSeries(result.data,
                function(item, callback) {
                    if (item.details && item.details[paidRankIndex]) {
                        rankDAO.getRankById(item.details[paidRankIndex], function(error, rank) {
                            item.details[paidRankIndex] = rank ? rank.name : item.details[paidRankIndex];
                            callback();
                        });
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

        result.type = commissionType;

        next(generateResponse(result));
    });
}

module.exports = get;
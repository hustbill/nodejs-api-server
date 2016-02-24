// GET /v2/admin/commissions/monthly/:distributor-id

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');

function formatOrders(arr, index){
    if(index < 0 || !u.isArray(arr) ){
        return arr;
    }

    arr.forEach(function(item){
        if(u.isArray(item) && u.isString(item[index])){
            var tmp = item[index];
            if(u.isEmpty(tmp)){
                item[index] = [];
            }else{
                item[index] = item[index].split('--');
            }
        }
    });

}

function sortByIndex(arr, index){
    if(index < 0 || !u.isArray(arr) || arr.length <= index){
        return arr;
    }

    return arr.sort(function(item1, item2){
         switch(item1[index] < item2[index]){
            case true:
                return 1;
            case false:
                return -1;
            default:
                return 0;
         }
    }); 
}


function generateResponse(data) {
    var type = data.type || {},
        result = {
            statusCode: 200,
            body: {
                "distributor-id": data.distributorId,
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
                    names: [],
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

    var item = data.data[0];

    //overview
    if (u.isObject(type.overview_fields) && !u.isEmpty(type.overview_fields) && u.isArray(item.overview)) {

        if (u.isArray(item.overview) && !u.isEmpty(item.overview) && u.isArray(type.overview_fields.displayNames)) {

            for (var i = 0; i < type.overview_fields.displayNames.length; i++) {
                var temp = {};
                temp.name = type.overview_fields.displayNames[i];
                temp.value = item.overview[i] || '';
                result.body.overview.push(temp);
            }

        }

    }

    //items

    if (u.isObject(type.details_fields) && !u.isEmpty(type.details_fields) && u.isArray(item.details)) {

        result.body.data.names = type.details_fields.displayNames || [];
        if (type.multi_line) {
            item.details = sortByIndex(item.details, type.details_fields.displayNames.indexOf('Bonus'));
            formatOrders(item.details, type.details_fields.displayNames.indexOf('Orders'));
            result.body.meta.count = item.details.length;

            if (result.body.meta.offset < 0 || result.body.meta.offset >= item.details.length) {
                result.body.meta.offset = 0;
            }
            var startIndex = result.body.meta.offset;
            var endIndex = result.body.meta.offset + result.body.meta.limit;



            if (endIndex > item.details.length) {
                endIndex = item.details.length ;
            }


            result.body.data.values = item.details.slice(startIndex, endIndex);
            // result.body.data.values = item.details;
        } else {
            result.body.data.values.push(item.details || []);

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
        distributorId = request.params.distributorId,
        date = request.query.date,
        typeCode = request.query['type-code'],
        offset = request.query.offset,
        limit = request.query.limit,
        commissionType = {},
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
        function(callback) {
            var commissionDao = daos.createDao('Commission', context);

            commissionDao.getMonthlyCommission({
                distributorId: distributorId,
                typeId: commissionType.id,
                date: date
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

        result.distributorId = distributorId;
        result.type = commissionType;
        result.meta.offset = offset;
        result.meta.limit = limit;

        next(generateResponse(result));
    });
}

module.exports = get;
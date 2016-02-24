/**
 * Commission DAO class.
 */

var util = require('util');
var async = require('async');
var u = require('underscore');
var DAO = require('./DAO.js');
var utils = require('../lib/utils');
var cacheKey = require('../lib/cacheKey');

function Commission(context) {
    DAO.call(this, context);
}

util.inherits(Commission, DAO);

function callbackIgnoreDBRelationDoesNotExistError(callback) {
    return function (error, results) {
        if (error) {
            /*jslint regexp: true*/
            if (/^relation ".*" does not exist$/.test(error.message)) {
                callback(null, {rows : []});
            } else {
                callback(error);
            }
            /*jslint regexp: false*/

            return;
        }

        callback(null, results);
    };
}

Commission.prototype.isValidDate = function (date, getDateMethod, callback) {
    var customError;

    if (utils.isValidDate(date) === false) {
        callback(new Error("Invalid date: " + date));
        return;
    }

    getDateMethod(
        function (error, result) {
            var year,
                monthAndDay;

            if (error) {
                callback(error);
                return;
            }
            year = date.substr(0, 4);
            monthAndDay = date.substr(4, 4);
            if (!result[year] && result[year].indexOf(monthAndDay) === -1) {
                customError = new Error("Invalid date: " + date);
                customError.statusCode = 400;
                callback(customError);
                return;
            }
            callback(null);
        }
    );
};

Commission.prototype.getOrganizationULByDistributorId = function (distributorId, callback) {
    var options,
        firstDayOfThisMonth = utils.getFirstDayOfMonth(new Date());

    options = {
        cache : {
            key : 'OrganizationULByDistributorId' + firstDayOfThisMonth + '_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: "SELECT * FROM mobile.get_report_organization_UL2($1, $2, NULL, NULL, 0) WHERE child_level > 0 AND  role_code='D'",
        sqlParams: [distributorId, firstDayOfThisMonth]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};

Commission.prototype.isValidMonthlyDate = function (date, callback) {
    this.isValidDate(
        date,
        this.getMonthlyDates.bind(this),
        callback
    );
};

Commission.prototype.isValidWeeklyDate = function (date, callback) {
    this.isValidDate(
        date,
        this.getWeeklyDates.bind(this),
        callback
    );
};

Commission.prototype.isValidQuarterlyDate = function (quarter, year, callback) {
    var customError;

    this.getQuarterlyDates(
        function (error, result) {
            if (error) {
                callback(error);
                return;
            }
            if (!result[year] && result[year].indexOf(quarter) === -1) {
                customError = new Error("Invaild year " + year + " and quarter " + quarter + " combination.");
                customError.statusCode = 400;
                callback(customError);
                return;
            }
            callback(null);
        }
    );
};

Commission.prototype.getDualteamView = function (distributorId, date, callback) {
    var options;

    options = {
        cache : {
            key : 'CommissionsDualteamView_' + date + '_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_qualification_dualteamview($1, $2, $3, $4)',
        sqlParams: [distributorId, date, null, null]   // return all results
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};

Commission.prototype.getCommissionRank = function (distributorId, date, callback) {
    var options;

    options = {
        cache : {
            key : 'CommissionsRank_' + date + '_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_commissions_rank($1, $2)',
        sqlParams: [distributorId, date]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};



/*
 *
 *  options = {
 *      date : <string>, required, YYYYMMDD
 *      offset : <integer>, optional
 *      limit : <integer>, optional
 *  }
 */
Commission.prototype.listUserCommissionSummary = function(options, callback){
    var context = this.context || {},
        config = context.config || {},
        table = "bonus.bonusm{YYYYMMDD}_commissions",
        sqlSelectCount = "",
        sqlSelect = "",
        sqlFrom = "",
        sqlWhere = " WHERE ",
        sqlGroup = "",
        sqlOrder = "",
        sqlOffsetLimit = "",
        sqlParams = [],
        sqlWhereConditions = [],
        result = {meta:{limit: options.limit, offset:options.offset, count:0}, data:[]},
        error;

        sqlSelectCount = "SELECT COUNT(DISTINCT c.distributor_id) count ";
        sqlSelect = " SELECT c.distributor_id, MAX(c.overview) overview, MAX(c.details) details, sum(c.commission) AS total  ";
        sqlFrom = " FROM commission_types ct ";
        sqlFrom += " INNER JOIN bonus.bonusm{YYYYMMDD}_commissions c ON c.commission_type_id = ct.id ";
        sqlGroup = " GROUP BY c.distributor_id ";
        sqlOrder = " ORDER BY total DESC ";


         async.waterfall([

            //table
            function(callback) {
                sqlFrom = sqlFrom.replace('{YYYYMMDD}', options.date);
                callback();

            },

            //where
            function(callback){
                if(options.countryId){
                    sqlFrom +=' INNER JOIN distributors d ON d.id = c.distributor_id ';
                    sqlFrom +=' INNER JOIN users u ON d.user_id = u.id ';
                    sqlFrom +=' INNER JOIN users_home_addresses uha ON uha.user_id = u.id AND uha.is_default = true AND uha.active = true ';
                    sqlFrom +=' INNER JOIN addresses add ON add.id = uha.address_id ';

                    sqlParams.push(options.countryId);
                    sqlWhereConditions.push(" add.country_id  = $" + sqlParams.length);
                }

                if (u.isEmpty(sqlWhereConditions)) {
                    sqlWhere = " ";
                } else {
                    sqlWhere += sqlWhereConditions.join(" AND ");
                }

                callback();
            },

            //count
            function(callback) {
                DAO.queryDatabase(context, {
                    sqlStmt: sqlSelectCount + sqlFrom + sqlWhere,
                    sqlParams: sqlParams
                }, callbackIgnoreDBRelationDoesNotExistError(function(error, res) {
                    if (error) {
                        return callback(error);
                    }

                    result.meta.count = u.isEmpty(res.rows) ? 0 : res.rows[0].count;
                    callback();
                }));
            },

             //limit
            function(callback) {
                if (options.offset) {
                    sqlOffsetLimit += " OFFSET " + options.offset; //TODO:
                }

                if (options.limit) {
                    sqlOffsetLimit += " LIMIT " + options.limit; //TODO:
                }


                if (options.limit < 0) {
                    sqlOffsetLimit = " "; //TODO:
                }

                callback();
            },

            //select
            function(callback) {
                DAO.queryDatabase(context, {
                    sqlStmt: sqlSelect + sqlFrom + sqlWhere + sqlGroup + sqlOrder + sqlOffsetLimit,
                    sqlParams: sqlParams
                }, callbackIgnoreDBRelationDoesNotExistError(function(error, res) {
                    if (error) {
                        return callback(error);
                    }

                    result.data = res.rows;

                    callback(null, result);
                }));
            }
           
        ], callback);

};

/*
 *
 *  options = {
 *      date : <string>, required, YYYYMMDD
 *      distributorId : <integer>, optional
 *  }
 */
Commission.prototype.getCommissionSummary = function(options, callback){
    var context = this.context || {},
        config = context.config || {},
        table = "bonus.bonusm{YYYYMMDD}_commissions",
        sqlSelect = "",
        sqlFrom = "",
        sqlWhere = " WHERE ",
        sqlGroup = "",
        sqlOrder = "",
        sqlParams = [],
        sqlWhereConditions = [],
        error;

        // sqlSelect = " SELECT ct.name, ct.code, ct.period, sum(c.commission) total, count(c.distributor_id) count ";
        sqlSelect = " SELECT MIN(ct.name) AS name, MIN(ct.code) AS code, MIN(ct.period) AS period, LEAST(ct.multi_line) AS multi_line, sum(c.commission) AS total, count(c.distributor_id) AS count ";
        sqlFrom = " FROM commission_types ct ";
        sqlFrom += " INNER JOIN bonus.bonusm{YYYYMMDD}_commissions c ON c.commission_type_id = ct.id ";
        sqlGroup = " GROUP BY ct.id, ct.multi_line ";
        sqlOrder = " ORDER BY total DESC ";


         async.waterfall([

            //table
            function(callback) {
                sqlFrom = sqlFrom.replace('{YYYYMMDD}', options.date);
                callback();

            },

            //where
            function(callback) {
                if (options.distributorId) {
                    sqlParams.push(options.distributorId);
                    sqlWhereConditions.push(" c.distributor_id = $" + sqlParams.length);
                }

                if(options.countryId){
                    sqlFrom +=' INNER JOIN distributors d ON d.id = c.distributor_id ';
                    sqlFrom +=' INNER JOIN users u ON d.user_id = u.id ';
                    sqlFrom +=' INNER JOIN users_home_addresses uha ON uha.user_id = u.id AND uha.is_default = true AND uha.active = true ';
                    sqlFrom +=' INNER JOIN addresses add ON add.id = uha.address_id ';

                    sqlParams.push(options.countryId);
                    sqlWhereConditions.push(" add.country_id  = $" + sqlParams.length);
                }

                if (u.isEmpty(sqlWhereConditions)) {
                    sqlWhere = " ";
                } else {
                    sqlWhere += sqlWhereConditions.join(" AND ");
                }

                callback();
            },

            //select
            function(callback) {
                DAO.queryDatabase(context, {
                    sqlStmt: sqlSelect + sqlFrom + sqlWhere + sqlGroup + sqlOrder ,
                    sqlParams: sqlParams
                }, callbackIgnoreDBRelationDoesNotExistError(function(error, res) {
                    if (error) {
                        return callback(error);
                    }

                    callback(null, res.rows);
                }));
            }
           
        ], callback);

};

Commission.prototype.getCommissionRank2 = function(options, callback){
    var context = this.context || {},
        config = context.config || {},
        application = config.application || {},
        commissions = application.commissions || {},
        rankSetting = commissions.ranks || {},
        table = rankSetting.table || "bonus.bonusm{YYYYMMDD}_ranks",//"bonus.bonusm{YYYYMMDD}_rankdetails",
        sqlSelect = " SELECT r.* ",
        sqlSelectCount = " SELECT COUNT(*) ",
        sqlFrom = " FROM ",
        sqlWhere = " WHERE ",
        sqlOffsetLimit = "",
        sqlGroup = "",
        sqlOrder = " ORDER BY r.distributor_id ",
        sqlParams = [],
        sqlWhereConditions = [],
        result = {meta:{limit: options.limit, offset:options.offset, count:0}, data:[]},
        error;

        async.waterfall([
            //table
            function(callback) {
                sqlFrom += table.replace('{YYYYMMDD}', options.date);
                sqlFrom += ' r';
                callback();

            },

            //where
            function(callback) {

                if(options.countryId){
                    sqlFrom +=' INNER JOIN distributors d ON d.id = r.distributor_id ';
                    sqlFrom +=' INNER JOIN users u ON d.user_id = u.id ';
                    sqlFrom +=' INNER JOIN users_home_addresses uha ON uha.user_id = u.id AND uha.is_default = true AND uha.active = true ';
                    sqlFrom +=' INNER JOIN addresses add ON add.id = uha.address_id ';

                    sqlParams.push(options.countryId);
                    sqlWhereConditions.push(" add.country_id  = $" + sqlParams.length);
                }

                if (options.distributorId) {
                    sqlParams.push(options.distributorId);
                    sqlWhereConditions.push(" r.distributor_id = $" + sqlParams.length);
                }

                if (u.isEmpty(sqlWhereConditions)) {
                    sqlWhere = " ";
                } else {
                    sqlWhere += sqlWhereConditions.join(" AND ");
                }

                callback();
            },

            //count
            function(callback) {
                DAO.queryDatabase(context, {
                    sqlStmt: sqlSelectCount + sqlFrom + sqlWhere,
                    sqlParams: sqlParams
                }, callbackIgnoreDBRelationDoesNotExistError(function(error, res) {
                    if (error) {
                        return callback(error);
                    }

                    result.meta.count = u.isEmpty(res.rows) ? 0 : res.rows[0].count;
                    callback();
                }));
            },

            //limit
            function(callback) {
                if (options.offset) {
                    sqlOffsetLimit += " OFFSET " + options.offset; //TODO:
                }

                if (options.limit) {
                    sqlOffsetLimit += " LIMIT " + options.limit; //TODO:
                }

                callback();
            },

            //select
            function(callback) {
                DAO.queryDatabase(context, {
                    sqlStmt: sqlSelect + sqlFrom + sqlWhere + sqlGroup + sqlOrder + sqlOffsetLimit,
                    sqlParams: sqlParams
                }, callbackIgnoreDBRelationDoesNotExistError(function(error, res) {
                    if (error) {
                        return callback(error);
                    }

                    callback(null, res.rows);
                }));
            },
            //decode json
            function(rows, callback){
                result.data = [];
                rows.forEach(function(item){
                    if(item.details){
                        item.details  = JSON.parse(item.details);
                    }

                    if(item.next_rank_details){
                        item.next_rank_details  = JSON.parse(item.next_rank_details);
                    }

                    result.data.push(item);
                });
                callback(null, result);
            }
        ], callback);
};




Commission.prototype.getMonthlyCommission =function(options, callback){
    var context = this.context || {},
        logger = context.logger || {},
        config = context.config || {},
        application = config.application || {},
        commissionSettings = application.commissions || {},
        typeId = options.typeId,
        table = "bonus.bonusm{YYYYMMDD}_commissions",
        sqlSelect = " SELECT c.* ",
        sqlSelectCount = " SELECT COUNT(*) ",
        sqlSelectSum = " SELECT SUM(commission) sum_commission ",
        sqlFrom = " FROM ",
        sqlWhere = " WHERE ",
        sqlOffsetLimit = "",
        sqlGroup = "",
        sqlOrder = " ORDER BY commission DESC ",
        sqlParams = [],
        sqlWhereConditions = [],
        result = {meta:{limit: options.limit, offset:options.offset, count:0}, data:[]},
        error;

    async.waterfall([
        //table
        function(callback){
            sqlFrom += table.replace('{YYYYMMDD}', options.date);
            sqlFrom += ' c';
            callback();
        },
       
        //where
        function(callback){

            if(options.countryId){
                sqlFrom +=' INNER JOIN distributors d ON d.id = c.distributor_id ';
                sqlFrom +=' INNER JOIN users u ON d.user_id = u.id ';
                sqlFrom +=' INNER JOIN users_home_addresses uha ON uha.user_id = u.id AND uha.is_default = true AND uha.active = true ';
                sqlFrom +=' INNER JOIN addresses add ON add.id = uha.address_id ';

                sqlParams.push(options.countryId);
                sqlWhereConditions.push(" add.country_id  = $" + sqlParams.length);
            }

            if(options.typeId){
                sqlParams.push(options.typeId);
                sqlWhereConditions.push(" commission_type_id = $"+sqlParams.length);
            }

            if(options.distributorId){
                sqlParams.push(options.distributorId);
                sqlWhereConditions.push(" distributor_id = $"+sqlParams.length);
            }

            if(u.isEmpty(sqlWhereConditions)){
                sqlWhere = " ";
            }else{
                sqlWhere += sqlWhereConditions.join(" AND ");
            }

            callback();
        },

        //count
        function(callback){
            DAO.queryDatabase(context,
            {
                sqlStmt: sqlSelectCount + sqlFrom + sqlWhere ,
                sqlParams: sqlParams
            }, callbackIgnoreDBRelationDoesNotExistError(function(error, res){
                if(error){
                    return callback(error);
                }

                result.meta.count = u.isEmpty(res.rows)? 0: res.rows[0].count;
                callback();
            }));
        },

        //sum
        function(callback){

            DAO.queryDatabase(context,
            {
                sqlStmt: sqlSelectSum + sqlFrom + sqlWhere ,
                sqlParams: sqlParams
            }, callbackIgnoreDBRelationDoesNotExistError(function(error, res){
                if(error){
                    return callback(error);
                }

                result.meta.sum_commission = u.isEmpty(res.rows)? 0: res.rows[0].sum_commission;
                callback();
            }));


        },

        //limit
        function(callback){
            if(options.offset){
                sqlOffsetLimit += " OFFSET " + options.offset; //TODO:
            }

            if(options.limit){
                sqlOffsetLimit += " LIMIT " + options.limit; //TODO:
            }

            callback();
        },

        //select
        function(callback){
            DAO.queryDatabase(context, {
                sqlStmt: sqlSelect + sqlFrom + sqlWhere + sqlGroup + sqlOrder + sqlOffsetLimit,
                sqlParams: sqlParams
            }, callbackIgnoreDBRelationDoesNotExistError(function(error, res){
                if(error){
                    return callback(error);
                }

                
                callback(null, res.rows);

            }));
        },
        //decode json
        function(rows, callback){
            result.data = [];
            rows.forEach(function(item){
                if(item.overview){
                    item.overview  = utils.parseJson(item.overview, []);
                }

                if(item.details){
                    item.details  = utils.parseJson(item.details, []);
                }

                result.data.push(item);
            });
            callback(null, result);
        }

        ], callback);

};


function generateSelectColumnByIdx(typeIdxs){
    var str = '';
    if(u.isArray(typeIdxs)){
        typeIdxs.forEach(function(item){
            str += " COALESCE(c.c{IDX}, 0) c{IDX} , ".replace(/\{IDX\}/g, item);
        });
    }

    return str;
}

/**
 * Return a JSON object
 * { meta : {limit:Number, offset:Number, count:Number}, data:[]}
 * e.g.
 * {
 *    meta: {limit: 25, offset:0, count:50},
 *    data:[{obj}, ...]
 * }
 *
 *
 * @method getOrders
 * @param options{
 *     date:<String> required,
 *     typeCnt:<Integer> required,
 *     countryId:<Integer> optional,
 *     limit:<Integer> optional,
 *     offset:<Integer> optional
 * }
 * @return {JSON} a json object
 */
Commission.prototype.getMonthlyCommission2 =function(options, callback){
    var context = this.context || {},
        self = this,
        logger = context.logger || {},
        config = context.config || {},
        application = config.application || {},
        commissionSettings = application.commissions || {},
        date = options.date,
        offset = options.offset,
        limit = options.limit,
        typeCnt = options.typeCnt,
        typeIdxs = u.range(1, typeCnt+1),
        table = "bonus.bonusm{YYYYMMDD}_commissions",
        sqlSelect = " SELECT c.* ",
        sqlSelectCount = " SELECT COUNT(DISTINCT c.distributor_id) ",
        sqlSelectSum = " SELECT SUM(commission) sum_commission ",
        sqlFrom = " FROM ",
        sqlWhere = " WHERE ",
        sqlOffsetLimit = "",
        sqlGroup = "",
        sqlOrder = " ORDER BY commission DESC ",
        sqlCrosstab = '',
        sql = '',
        sqlParams = [],
        sqlWhereConditions = [],
        result = {meta:{limit: options.limit, offset:options.offset, count:0}, data:[]},
        cacheTTL = 30 * 60,    // 30 minutes
        error;

        // logger.debug("options:%j", options);

    async.waterfall([
        
        //table
        function(callback){
            table = table.replace('{YYYYMMDD}', options.date);
            sqlFrom += table + ' c';
            callback();
        },
       
        //where
        function(callback){

            if(options.countryId){
                sqlFrom +=' INNER JOIN distributors d ON d.id = c.distributor_id ';
                sqlFrom +=' INNER JOIN users u ON d.user_id = u.id ';
                sqlFrom +=' INNER JOIN users_home_addresses uha ON uha.user_id = u.id AND uha.is_default = true AND uha.active = true ';
                sqlFrom +=' INNER JOIN addresses add ON add.id = uha.address_id ';

                sqlParams.push(options.countryId);
                sqlWhereConditions.push(" add.country_id  = $" + sqlParams.length);
            }

            if(u.isEmpty(sqlWhereConditions)){
                sqlWhere = " ";
            }else{
                sqlWhere += sqlWhereConditions.join(" AND ");
            }

            callback();
        },

        //count
        function(callback){
            DAO.queryDatabase(context,
            {
                cache : {
                    key : cacheKey.monthlyCommission2Count(date, options.countryId),
                    ttl : cacheTTL
                },
                sqlStmt: sqlSelectCount + sqlFrom + sqlWhere ,
                sqlParams: sqlParams
            }, callbackIgnoreDBRelationDoesNotExistError(function(error, res){
                if(error){
                    return callback(error);
                }

                result.meta.count = u.isEmpty(res.rows)? 0: res.rows[0].count;
                callback();
            }));
        },

        //sum
        function(callback){

            DAO.queryDatabase(context,
            {
                cache : {
                    key : cacheKey.monthlyCommission2Sum(date, options.countryId),
                    ttl : cacheTTL
                },
                sqlStmt: sqlSelectSum + sqlFrom + sqlWhere ,
                sqlParams: sqlParams
            }, callbackIgnoreDBRelationDoesNotExistError(function(error, res){
                if(error){
                    return callback(error);
                }

                result.meta.sum_commission = u.isEmpty(res.rows)? 0: res.rows[0].sum_commission;
                callback();
            }));


        },

        //limit
        function(callback){
            if(options.offset){
                sqlOffsetLimit += " OFFSET " + options.offset; //TODO:
            }

            if(options.limit){
                sqlOffsetLimit += " LIMIT " + options.limit; //TODO:
            }

            callback();
        },

        //select
        function(callback){

            sqlCrosstab += ' SELECT c.distributor_id , c.commission_type_id, COALESCE(c.commission, 0) ';
            sqlCrosstab += ' FROM ' + table + ' c ';
            sqlCrosstab += ' ORDER BY 1, 2 ';

            
          
            sql += " SELECT c.distributor_id, add.firstname || ' ' || add.lastname AS distributor_name, " + generateSelectColumnByIdx(typeIdxs) + " COALESCE(c.c"+typeIdxs.join(", 0) + COALESCE(c.c")+", 0) AS sum_c ";
            sql += " FROM crosstab ('"+sqlCrosstab+"', 'SELECT id FROM commission_types ORDER BY id')";
            sql += " AS c(distributor_id integer, c"+ typeIdxs.join(" numeric(18,2), c")+" numeric(18,2)) ";
            sql += " INNER JOIN distributors d ON d.id = c.distributor_id ";
            sql += " INNER JOIN users u ON u.id = d.user_id ";
            sql += " INNER JOIN users_home_addresses uha ON uha.user_id = u.id and uha.is_default = true and uha.active = true  ";
            sql += " INNER JOIN addresses add ON add.id = uha.address_id  ";
            sql += sqlWhere;
            sql += " ORDER BY sum_c DESC ";

             


            DAO.queryDatabase(context, {
                cache : {
                    key : cacheKey.monthlyCommission2LimitOffset(date, options.countryId, limit, offset),
                    ttl : cacheTTL
                },
                sqlStmt: sql+ sqlOffsetLimit,
                sqlParams: sqlParams
            }, callbackIgnoreDBRelationDoesNotExistError(function(error, res){
                if(error){
                    return callback(error);
                }

                result.data = res.rows;
                callback(null, result);

            }));
        }
        ], callback);

};


Commission.prototype.getMonthlyUnilevelCommission = function (context, callback) {
    var options,
        input = context.input,
        date = input.date,
        offset = input.offset,
        limit = input.limit,
        distributorId = context.user.distributorId;

    options = {
        cache : {
            key : 'CommissionsUnilevel_' + date + '_' + offset + '_' + limit + '_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_commissoins_monthlyUL($1, $2, $3, $4) order by distributor_id',
        sqlParams: [distributorId, date, limit, offset]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};

Commission.prototype.getMonthlyUnilevelCommissionCount = function (distributorId, date, callback) {
    var options;

    options = {
        cache : {
            key : 'CommissionsUnilevelCount_' + date + '_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT count(*) FROM mobile.get_commissoins_monthlyUL($1, $2, null, null)',
        sqlParams: [distributorId, date]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};

Commission.prototype.getMonthlyUnilevelCommissionSummary = function (distributorId, date, callback) {
    var options;

    options = {
        cache : {
            key : 'CommissionsUnilevelSummary_' + date + '_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_commissions_monthly_summary($1, $2, $3)',
        sqlParams: [distributorId, 'UL', date]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};

Commission.prototype.getMonthlyUnilevelMatchCommission = function (context, callback) {
    var options,
        input = context.input,
        date = input.date,
        offset = input.offset,
        limit = input.limit,
        distributorId = context.user.distributorId;

    options = {
        cache : {
            key : 'CommissionsUnilevelMatch_' + date + '_' + offset + '_' + limit + '_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_commissoins_monthlyULM($1, $2, $3, $4) order by distributor_id',
        sqlParams: [distributorId, date, limit, offset]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};

Commission.prototype.getMonthlyUnilevelMatchCommissionCount = function (distributorId, date, callback) {
    var options;

    options = {
        cache : {
            key : 'CommissionsUnilevelMatchCount_' + date + '_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT count(*) FROM mobile.get_commissoins_monthlyULM($1, $2, null, null)',
        sqlParams: [distributorId, date]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};

Commission.prototype.getMonthlyUnilevelMatchCommissionSummary = function (distributorId, date, callback) {
    var options;

    options = {
        cache : {
            key : 'CommissionsUnilevelMatchSummary_' + date + '_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_commissions_monthly_summary($1, $2, $3)',
        sqlParams: [distributorId, 'ULM', date]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};

Commission.prototype.getMonthlyGenerationCommission = function (context, callback) {
    var options,
        input = context.input,
        date = input.date,
        offset = input.offset,
        limit = input.limit,
        distributorId = context.user.distributorId;

    options = {
        cache : {
            key : 'CommissionsGeneration_' + date + '_' + offset + '_' + limit + '_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_commissoins_monthlyGEN($1, $2, $3, $4) order by distributor_id',
        sqlParams: [distributorId, date, limit, offset]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};

Commission.prototype.getMonthlyGenerationCommissionCount = function (distributorId, date, callback) {
    var options;

    options = {
        cache : {
            key : 'CommissionsGenerationCount_' + date + '_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT count(*) FROM mobile.get_commissoins_monthlyGEN($1, $2, null, null)',
        sqlParams: [distributorId, date]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};

Commission.prototype.getMonthlyGenerationCommissionSummary = function (distributorId, date, callback) {
    var options;

    options = {
        cache : {
            key : 'CommissionsGenerationSummary_' + date + '_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_commissions_monthly_summary($1, $2, $3)',
        sqlParams: [distributorId, 'GEN', date]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};

Commission.prototype.getQuarterlyCommission = function (distributorId, year, quarter, callback) {
    var options;

    options = {
        cache : {
            key : 'CommissionsQuarterly_' + year + '_' + quarter + '_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_commissoins_quarterly($1, $2, $3) order by pool_type',
        sqlParams: [distributorId, year, quarter]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};

/**
 * Return a record with the following columns:
 *
 * prev_pv_co_left        | 190704657.00
 * prev_pv_co_right       | 0.00
 * curr_pv_co_left        | 192289772.54
 * curr_pv_co_right       | 0.00
 * pv_left_sum            | 2074072.76
 * pv_right_sum           | 488957.22
 * bonus                  | 75000.00
 * bonus_percentage       | 0.20
 * fx_rate                | 1.00
 * retail_commission_info |
 * fasttrack_earning_info |
 *
 * Following fields are addded after 2013-09-09
 * bonus_no_cap           | 0.00
 * pvdt_sum_ul_all        | 0.00
 * pvdt_pay_volume        | 0.00
 * bonus_cap              | 0.00
 * bonus_cap_adjusted     | 0.00
 * pvdt_sum_all           | 0.00
 * pvdt_sum_paid          | 0.00
 * cycle_count            | 0.00
 * cycle_count_total      | 0.00
 * universal_cap_amount   | 0.00
 */
Commission.prototype.getWeeklyCommission = function (distributorId, date, callback) {
    var options;

    options = {
        cache : {
            key : 'CommissionsWeekly_' + date + '_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_commissoins_weekly($1, $2)',
        sqlParams: [distributorId, date]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};

Commission.prototype.getWeeklyFlushingPoints = function (distributorId, date, callback) {
    var tableName = 'bonus.bonusw' + date + '_flushingdetails',
        options;

    options = {
        cache : {
            key : 'WeeklyFlushingPoints_' + date + '_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM ' + tableName + ' WHERE distributor_id = $1',
        sqlParams: [distributorId]   // return all results
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};

/**
 * Return a JSON object
 * { year : [<month><day>] }
 * e.g.
 * {
 *    "2012"  : ["0301","0201","0101"],
 *    "2011"  : ["1201","1101","1001","0901","0801","0701"],
 * }
 *
 * month and day combinations are sorted in descending order
 *
 * @method getMonthlyDates
 * @param callback {Function} callback function
 * @return {JSON} a json object
 */
Commission.prototype.getMonthlyDates = function (callback) {
    var returnResult = {},
        error,
        options,
        date,
        monthAndDay,
        year;

    options = {
        cache : {
            key : 'CommissionsMonthlyDates',
            ttl : 60 * 60 * 4  // 4 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_monthly_date_files()',
        sqlParams: []
    };

    this.queryDatabase(
        options,
        function (error, result) {
            if (error) {
                callback(error);
                return;
            }

            // guard again any malfunctioned database data which
            // can trigger an exception
            try {
                result.rows.forEach(
                    function (row) {
                        date = row.get_monthly_date_files;
                        year = date.substr(0, 4);
                        monthAndDay = date.substr(4, 4);

                        if (returnResult[year] === undefined) {
                            returnResult[year] = [monthAndDay];
                        } else {
                            returnResult[year].push(monthAndDay);
                        }
                    }
                );
                callback(null, returnResult);
            } catch (exception) {
                callback(exception);
            }
        }
    );
};

/**
 * Return a JSON object
 * { year : [quarter] }
 * e.g.
 * {
 *    "2013"  : [1],
 *    "2012"  : [4, 3, 2, 1],
 * }
 *
 * quarters are sorted in descending order
 *
 * @method getQuarterlyDates
 * @param callback {Function} callback function
 * @return {JSON} a json object
 */
Commission.prototype.getQuarterlyDates = function (callback) {
    var returnResult = {},
        error,
        options,
        key,
        quarter,
        year;

    options = {
        cache : {
            key : 'CommissionsQuarterlyDates',
            ttl : 60 * 60 * 4  // 4 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_quarterly_date_files()',
        sqlParams: []
    };

    this.queryDatabase(
        options,
        function (error, result) {
            if (error) {
                callback(error);
                return;
            }

            // guard again any malfunctioned database data which
            // can trigger an exception
            try {
                result.rows.forEach(
                    function (row) {
                        year = row.year;
                        quarter = row.quarter;

                        if (returnResult[year] === undefined) {
                            returnResult[year] = [quarter];
                        } else {
                            returnResult[year].push(quarter);
                        }
                    }
                );

                // we might we the data like { "2012" : [3, 2, 4] }
                // need to sort the quarters to { "2012" : [4, 3, 2] }
                Object.keys(returnResult).forEach(
                    function (key) {
                        returnResult[key].sort().reverse();
                    }
                );
                callback(null, returnResult);
            } catch (exception) {
                callback(exception);
            }
        }
    );
};

/**
 * Return a JSON object
 * { year : [<month><day>] }
 * e.g.
 * {
 *    "2012"  : ["0115","0108","0101"],
 *    "2011"  : ["0409", "0402", "0326", "0319", "0312", "0305"]
 * }
 *
 * month and day combinations are sorted in descending order
 *
 * @method getWeeklyDates
 * @param callback {Function} callback function
 * @return {JSON} a json object
 */
Commission.prototype.getWeeklyDates = function (callback) {
    var returnResult = {},
        error,
        options,
        date,
        monthAndDay,
        year;

    options = {
        cache : {
            key : 'CommissionsWeeklyDates',
            ttl : 60 * 60 * 4  // 4 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_weekly_date_files()',
        sqlParams: []
    };

    this.queryDatabase(
        options,
        function (error, result) {
            if (error) {
                callback(error);
                return;
            }

            // guard again any malfunctioned database data which
            // can trigger an exception
            try {
                result.rows.forEach(
                    function (row) {
                        date = row.get_weekly_date_files;
                        year = date.substr(0, 4);
                        monthAndDay = date.substr(4, 4);

                        if (returnResult[year] === undefined) {
                            returnResult[year] = [monthAndDay];
                        } else {
                            returnResult[year].push(monthAndDay);
                        }
                    }
                );
                callback(null, returnResult);
            } catch (exception) {
                callback(exception);
            }
        }
    );
};

Commission.prototype.getNextRenewalDate = function(ids, callback){
    var idSql,
        error,
        sql;

    if (ids.length !== 0) {
        idSql = '(\'' + ids.join('\', \'') + '\')';
    } else {
        callback(null, []);
        return;
    }

    sql = 'SELECT id, next_renewal_date FROM distributors WHERE id in ' + idSql;
    options = {
        cache : {
            key : 'getNextRenewalDate' + idSql,
            ttl : 60 * 15
        },
        sqlStmt: sql,
        sqlParams: []
    };
    this.queryDatabase(options, callback);
};

Commission.prototype.getInactiveId = function(date, distributorId, callback){
    var firstDayOfThisMonth = date.replace(new RegExp(/(-)/g),''),
        options;

    sql = "SELECT * FROM mobile.get_report_organization_UL2($1, $2, null, null, 0) WHERE child_level > 0 AND role_code='D'";

    options = {
        cache : {
             key : 'getInactiveId' + distributorId + firstDayOfThisMonth,
             ttl : 60 * 15
        },
        sqlStmt: sql,
        sqlParams: [distributorId, firstDayOfThisMonth]
    };

    this.queryDatabase(options, function(error, result){
        if (error) {
            var result = {};
            result.rows = [];
            callback(null, result);
            return;
        };
        callback(null, result);
    });
};

Commission.prototype.getAdvisorDetailJson = function(date, distributorId, callback){
    var firstDayOfThisMonth = date || utils.getFirstDayOfMonth(new Date());
    firstDayOfThisMonth = firstDayOfThisMonth.replace(new RegExp(/(-)/g),'');
    var tableName = "bonus.bonusm" + firstDayOfThisMonth + "_ranks",
        options;

    if (!distributorId) {
        sql = 'SELECT distributor_id, details, r.role_code,u.id as uid FROM '+tableName+' b, distributors d, users u, roles_users ru , roles r WHERE distributor_id = d.id AND d.user_id=u.id AND ru.user_id=u.id and ru.role_id = r.id';
        options = {
            cache : {
                key : 'AdvisorDetailJson_admin' + tableName,
                ttl : 60 * 15
            },
            sqlStmt: sql,
            sqlParams: []
        };
    } else {
        sql = 'SELECT distributor_id, details, r.role_code,u.id as uid FROM '+tableName+' b, distributors d, users u, roles_users ru , roles r, get_row_distributor_children($1) AS tree ';
        sql += ' WHERE distributor_id = d.id AND d.user_id=u.id AND ru.user_id=u.id and ru.role_id = r.id AND tree.child_id = d.id';
        options = {
            cache : {
                key : 'AdvisorDetailJson' + distributorId + tableName,
                ttl : 60 * 15
            },
            sqlStmt: sql,
            sqlParams: [distributorId]
        };
    }

    this.queryDatabase(options, function(error, result){
        if (error) {
            var result = {};
            result.rows = [];
            callback(null, result);
            return;
        };
        callback(null, result);
    });
};

Commission.prototype.getSponsorId = function(ids, callback){
    var options,
        idArr = '(' + ids.join(',') + ')',
        sql = 'select d.id, d.personal_sponsor_distributor_id from Users u, Distributors d where d.user_id = u.id and d.id in ' + idArr;

    if (!ids || ids.length === 0) {
        callback(null, [])
        return;
    };

    options = {
        sqlStmt: sql,
        sqlParams: []
    };

    this.queryDatabase(options,function(error, sponsorIds){
        if (error) {
            callback(error);
            return;
        }
        sponsorIds = sponsorIds.rows;
        callback(null, sponsorIds);
    });
};

Commission.prototype.getMailAndName = function(ids, callback){
    var options,
        idArr = [],
        sql;
        
    if (!ids || ids.length === 0) {
        callback(null, [])
        return;
    };

    ids.forEach(function(id){
        idArr.push(id.id, id.personal_sponsor_distributor_id);
    });

    idArr = '(' + idArr.join(',') +')';
    sql = 'select d.id, u.email, a.firstname,a.lastname,c.iso from distributors d, users u, users_home_addresses ua, addresses a,countries c where d.id in ' + idArr + '  and u.id = d.user_id and ua.user_id = u.id and a.id = ua.address_id and c.id = a.country_id';

    options = {
        sqlStmt: sql,
        sqlParams: []
    };

    this.queryDatabase(options, function(error, result){
        if (error) {
            callback(error);
            return;
        }
        result = result.rows;
        callback(null, result);
    });
};

/**
 * Return a array
 * [{obj}]
 * e.g:
 * [
 *  {
 *  "order-number": "F00000013712",
 *  "order-date": "2014-09-30T15:24:32.000Z",
 *  "pvq": 407.5,
 *  "pvr": 407.5,
 *  "country-iso": "US",
 *  "state-date": "2014-09-30T15:24:32.000Z"
 * },...]
 *
 * @method getOrderInfo
 * @param options{
 *     distributorId:<Integer> required,
 *     startDate:<String> required //'YYYY-MM-DD',
 *     endDate:<String> required //'YYYY-MM-DD'
 * }
 * @return [{obj}] a  object array
 */
Commission.prototype.getOrderInfo = function(options, callback){
    var context = this.context || {},
        logger = context.logger || {},
        distributorId = options.distributorId,
        startDate = options.startDate,
        endDate = options.endDate,
        sqlStmt,
        error;

        if (!u.isNumber(distributorId)) {
            error = new Error("distributorId is required.");
            error.errorCode = 'InvalidDistributorId';
            error.statusCode = 400;
            callback(error);
            return;
        }

        if (!u.isString(startDate)) {
            error = new Error("startDate is required.");
            error.errorCode = 'InvalidStartDate';
            error.statusCode = 400;
            callback(error);
            return;
        }
        if (!u.isString(endDate)) {
            error = new Error("endDate is required.");
            error.errorCode = 'InvalidEndDate';
            error.statusCode = 400;
            callback(error);
            return;
        }

        sqlStmt = ' SELECT cv.order_number, cv.order_date, cv.pvq, cv.pvr, cv.order_ship_country_iso AS country_iso, cv.state_date, ';
        sqlStmt += ' (SELECT role_id FROM line_items WHERE order_id=cv.order_id ORDER BY id limit 1) AS role_id ';
        sqlStmt += ' FROM   data_management.commission_volume cv ';
        sqlStmt += ' INNER JOIN distributors d on d.user_id = cv.user_id ';
        sqlStmt += ' WHERE  d.id = $1 ';
        sqlStmt += ' AND    cv.order_commission_state IN ( SELECT *  FROM get_commission_state_forward()) ';
        sqlStmt += " AND    cv.state_date >= to_date($2, 'YYYY-MM-DD') ";
        sqlStmt += " AND    cv.state_date < to_date($3, 'YYYY-MM-DD') + '1 day'::interval";

        queryDatabaseOptions = {
        cache : {
            key : 'GetOrderInfoByDistributorId' + distributorId + '_' + startDate + '_'+ endDate,
            ttl : 60 * 30  // 30 seconds
        },
        sqlStmt: sqlStmt,
        sqlParams: [distributorId, startDate, endDate]
    };

    this.queryDatabase(queryDatabaseOptions, function(error, result){
        if(error){
            callback(error);
            return;
        }

        if(result && u.isArray(result.rows)){
            var items = [];
            result.rows.forEach(function(item){
                items.push({
                    'order-number':item.order_number,
                    'order-date': item.order_date,
                    pvq: item.pvq,
                    pvr: item.pvr,
                    'country-iso': item.country_iso,
                    'state-date': item.state_date
                });
            });
           callback(null, items);
        }else{
            callback(null, []);
        }
        

    });



}

module.exports = Commission;

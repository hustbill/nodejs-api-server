/**
 * Report DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var u = require('underscore');

function Report(context) {
    DAO.call(this, context);
}

util.inherits(Report, DAO);

Report.prototype.getReturns = function (distributorId, startDate, endDate, callback) {
    var options;

    options = {
        cache : {
            key : 'ReportsReturns_' + startDate + '_' + endDate + '_' + distributorId,
            ttl : 3600 // 60 * 60 * 1: 1 hour
        },
        sqlStmt: 'SELECT * FROM mobile.get_reports_returns($1, $2, $3, $4, $5) order by returned_date desc',
        sqlParams: [distributorId, startDate, endDate, null, null]
    };

    this.queryDatabase(options, callback);
};

Report.prototype.getGrowth = function (distributorId, date, callback) {
    var options;

    options = {
        cache : {
            key : 'ReportsRecentGrowth_' + date + '_' + distributorId,
            ttl : 60 * 60 * 2 // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_report_growth_detail($1, $2)',
        sqlParams: [distributorId, date]
    };

    this.queryDatabase(options, callback);
};

Report.prototype.getOrganizationDualteam = function (context, callback) {
    var input = context.input,
        date = input.date,
        limit = input.limit,
        offset = input.offset,
        orders_only = input.orders_only,
        distributorId = context.user.distributorId,
        options;

    options = {
        cache : {
            key : 'ReportsOrganizationDualteam_' + date + '_' + offset + '_' + limit + '_' + orders_only + '_' + distributorId,
            ttl : 60 * 60 * 2 // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_report_organization_DT($1, $2, $3, $4, $5) order by distributor_id desc',
        sqlParams: [distributorId, date, limit, offset, orders_only]
    };

    this.queryDatabase(options, callback);
};

Report.prototype.getSingleOrganizationDualteam = function (context, callback) {
    var input = context.input,
        bonus_table = 'bonus.bonusw' + input.date,
        orders_only = input.orders_only,
        distributorId = context.user.distributorId,
        child_distributor_id = input.child_distributor_id,
        options;

    options = {
        cache : {
            key : 'getSingleOrganizationDualteam_' + bonus_table + '_' + distributorId + '_' + child_distributor_id + '_' + orders_only,
            ttl : 60 * 60 * 2 // 2 hours
        },
        sqlStmt: 'SELECT * FROM get_dist_dt_single_child_bonus_info($1, $2, $3, $4)',
        sqlParams: [bonus_table, distributorId, child_distributor_id, orders_only]
    };

    this.queryDatabase(options, callback);
};

Report.prototype.getOrganizationDualteamCount = function (distributorId, date, orders_only, callback) {
    var options,
        sqlStmt;

    sqlStmt = 'SELECT count(*) FROM get_row_dt_children($1) JOIN bonus.bonusw' + date + ' cm on child_id=cm.id';
    if (orders_only === '1') {
        sqlStmt += " WHERE order_info > ''";
    }

    options = {
        cache : {
            key : 'ReportsOrganizationDualteamCount_' + date + '_' + orders_only + '_' + distributorId,
            ttl : 60 * 60 * 2 // 2 hours
        },
        sqlStmt: sqlStmt,
        sqlParams: [distributorId]
    };

    this.queryDatabase(options, callback);
};

Report.prototype.getOrganizationForcedMatrix = function(options, callback){
    var context = this.context;
    var table = "bonus.bonusm{YYYYMMDD}";
    var sqlSelectCount = "";
    var sqlSelect = "";
    var sqlFrom = "";
    var sqlWhere = " WHERE ";
    var sqlGroup = "";
    var sqlOrder = "";
    var sqlOffsetLimit = "";
    var sqlParams = [];
    var sqlWhereConditions = [];
    var result = {meta:{limit: options.limit, offset:options.offset, count:0}, data:[]};
    var error;


    

        sqlSelectCount = "SELECT COUNT(DISTINCT t.distributor_id) count ";

        sqlSelect = " SELECT t.distributor_id, r.role_code,  add.firstname|| ' ' || add.lastname  AS distributor_name, u.login, u.email, add.phone, t.level - $1 AS level, t.position - (($2 << (t.level-$1)) - (1 << (t.level-$1))) AS position, ";
        sqlSelect += " CASE WHEN r.role_code = 'D' THEN date_trunc('day', COALESCE(d.special_distributor_next_renewal_date,  TIMESTAMP '2015-01-01')) >= date_trunc('day', now()) ELSE true END AND date_trunc('day', COALESCE(d.next_renewal_date,  TIMESTAMP '2015-01-01')) >= date_trunc('day', now()) AS active ";

        if(options.sponsorId){
            sqlSelect += ', CASE WHEN d.personal_sponsor_distributor_id = ' + options.sponsorId + ' THEN true ELSE false END AS is_sponsored  ';
        }
        sqlFrom +=' FROM medicus_distributor_level_position t ';
        sqlFrom +=' INNER JOIN distributors d ON d.id = t.distributor_id  ';
        sqlFrom +=' INNER JOIN users u ON d.user_id = u.id  AND u.status_id = 1 ';
        sqlFrom +=' INNER JOIN roles_users ru ON ru.user_id = u.id ';
        sqlFrom +=' INNER JOIN roles r ON r.id= ru.role_id ';
        sqlFrom +=' LEFT JOIN users_home_addresses uha ON uha.user_id = u.id AND uha.is_default = true AND uha.active = true  ';
        sqlFrom +=' LEFT JOIN addresses add ON add.id = uha.address_id ';

        if(options.onlyUnilevel && options.sponsorId ){
            sqlFrom +=' INNER JOIN get_row_distributor_children(' + options.sponsorId + ') t2 ON t2.child_id = d.id ';
        }

        sqlOrder = " ORDER BY t.level, t.position ";

        sqlWhereConditions.push(' t.position <= ($2 << (t.level-$1))  ');
        sqlWhereConditions.push(' t.position > (($2 << (t.level-$1)) - (1 << (t.level-$1))) ');
        sqlWhereConditions.push(' t.level >=$1 ');
        sqlWhereConditions.push(' t.distributor_id is not NULL ');

        sqlParams = [options.level, options.position];


         async.waterfall([
            //where
            function(callback){
                if(options.roleCode){
                    sqlParams.push(options.roleCode);
                    sqlWhereConditions.push(" r.role_code  = $" + sqlParams.length);
                }

                if(options.onlySponsored && options.sponsorId ){
                    sqlParams.push(options.sponsorId);
                    sqlWhereConditions.push(" d.personal_sponsor_distributor_id  = $" + sqlParams.length);
                }

                if(options.onlyActive){
                    sqlWhereConditions.push(" date_trunc('day', COALESCE(d.next_renewal_date,  TIMESTAMP '2015-01-01')) >= date_trunc('day', now()) " );
                }

                if(options.childId){
                    sqlParams.push(options.childId);
                    sqlWhereConditions.push(" t.distributor_id  = $" + sqlParams.length);
                }
                
                if(options.childLogin){
                    sqlParams.push(options.childLogin+'%');
                    sqlWhereConditions.push(" u.login  ILIKE $" + sqlParams.length);
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
                }, function(error, res) {
                    if (error) {
                        return callback(error);
                    }

                    result.meta.count = u.isEmpty(res.rows) ? 0 : res.rows[0].count;
                    callback();
                });
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
                },function(error, res) {
                    if (error) {
                        return callback(error);
                    }

                    result.data = res.rows;

                    callback(null, result);
                });
            }
           
        ], callback);
};

Report.prototype.getOrganizationUnilevel = function (context, callback) {
    var input = context.input,
        date = input.date,
        limit = input.limit,
        offset = input.offset,
        orders_only = input.orders_only,
        distributorId = input.distributor_id,
        options,
        sqlStmt,
        roleSql = "",
        rankSql = "",
        role = "",
        rank = "",
        pvSql = "",
        carrerRankSql = "",
        countrySql = "";

    if (input.role.length !== 0) {
        role = '(\'' + input.role.join('\', \'') + '\')';
        roleSql = "and role_code in " + role;
    };

    if (input.ranks.length !== 0) {
        rank = '(\'' + input.ranks.join('\', \'') + '\')';
        rankSql = "and rank_code in " + rank;
    };

    if (input.pv_only * 1 === 1) {
        pvSql = ' and substring(details from \'"personal-qualification-volume":(.*?),\')::double precision > 0.0';
    };

    if (input.carrer_rank_number) {
        carrerRankSql = ' and substring(details from \'"career-title-rank":(.*?),\')::double precision =' + input.carrer_rank_number;
    };

    if (input.country_iso) {
        countrySql = " and country_name = '" + input.country_iso + "'";
    };

    sqlStmt =  'SELECT * FROM mobile.get_report_organization_UL2($1, $2, $3, $4, $5) WHERE 1=1 ' + roleSql + rankSql + pvSql + carrerRankSql + countrySql + ' ORDER BY child_level, role_code, distributor_id LIMIT ' + limit + ' OFFSET ' + offset;
    
    options = {
        sqlStmt: sqlStmt,
        sqlParams: [distributorId, date, null, null, orders_only]
    };

    this.queryDatabase(options, callback);
};


Report.prototype.getOrganizationUnilevelCount = function (context, callback) {
    var options,
        sqlStmt,
        input = context.input,
        date = input.date,
        limit = input.limit,
        offset = input.offset,
        orders_only = input.orders_only,
        distributorId = input.distributor_id,
        roleSql = '',
        rankSql = '',
        role = "",
        rank = "",
        pvSql = "",
        carrerRankSql = "",
        countrySql = "";

    if (input.role.length !== 0) {
        role = '(\'' + input.role.join('\', \'') + '\')';
        roleSql = "and role_code in " + role;
    };

    if (input.ranks.length !== 0) {
        rank = '(\'' + input.ranks.join('\', \'') + '\')';
        rankSql = "and rank_code in " + rank;
    };

    if (input.pv_only * 1 === 1) {
        pvSql = 'and substring(details from \'"personal-qualification-volume":(.*?),\')::double precision > 0.0';
    };

    if (input.carrer_rank_number) {
        carrerRankSql = ' and substring(details from \'"career-title-rank":(.*?),\')::double precision =' + input.carrer_rank_number;
    };

    if (input.country_iso) {
        countrySql = " and country_name = '" + input.country_iso + "'";
    };

    sqlStmt =  'SELECT count(*) FROM mobile.get_report_organization_UL2($1, $2, NULL, NUll, $3) WHERE 1=1 ' + roleSql + rankSql + pvSql + carrerRankSql + countrySql;
    
    options = {
        sqlStmt: sqlStmt,
        sqlParams: [distributorId, date, orders_only]
    };

    this.queryDatabase(options, callback);
};

Report.prototype.getSingleOrganizationUnilevel = function (context, callback) {
    var input = context.input,
        bonus_table = 'bonus.bonusm' + input.date,
        orders_only = input.orders_only,
        distributorId = input.distributor_id,
        child_distributor_id = input.child_distributor_id,
        options;

    options = {
        cache : {
            key : 'ReportsSingleOrganizationUnilevel_' + bonus_table + '_' + distributorId + '_' + child_distributor_id + '_' + orders_only,
            ttl : 60 * 60 * 2 // 2 hours
        },
        sqlStmt: 'SELECT * FROM get_dist_ul_single_child_bonus_info2($1, $2, $3, $4)',
        sqlParams: [bonus_table, distributorId, child_distributor_id, orders_only]
    };

    this.queryDatabase(options, callback);
};

Report.prototype.getOrders = function (distributorId, offset, limit, callback) {
    var options;

    options = {
        cache : {
            key : 'ReportsOrders_' + offset + '_' + limit + '_' + distributorId,
            ttl : 60 * 5 // 5 minutes
        },
        sqlStmt: 'SELECT * FROM mobile.get_reports_orders($1, $2, $3)',
        sqlParams: [distributorId, limit, offset]
    };

    this.queryDatabase(options, callback);
};

Report.prototype.getOrdersCount = function (distributorId, callback) {
    var options;

    options = {
        cache : {
            key : 'ReportsOrdersCount_' + distributorId,
            ttl : 60 * 5  // 5 minutes
        },
        sqlStmt: 'SELECT count(*) FROM mobile.get_reports_orders($1)',
        sqlParams: [distributorId]
    };

    this.queryDatabase(options, callback);
};


Report.prototype.getSummaries = function (distributorId, date, callback) {
    var options;

    options = {
        cache : {
            key : 'ReportsTotal_' + date + '_' + distributorId,
            ttl : 60 * 60 * 2 // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_report_total($1, $2)',
        sqlParams: [distributorId, date]
    };

    this.queryDatabase(options, callback);
};

module.exports = Report;

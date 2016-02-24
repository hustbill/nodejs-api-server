/**
 * Dashboard DAO class.
 */

var util = require('util');
var DAO = require('./DAO.js');
var u = require('underscore');
var utils = require('../lib/utils');
var async = require('async');
var moment = require('moment');

function Dashboard(context) {
    DAO.call(this, context);
}

util.inherits(Dashboard, DAO);

module.exports = Dashboard;

function get3MonthPersonalVolume(distributor, distributors, sponsors) {
    var volume = u.reduce(u.values(distributor.commissionPeriods), function(memo, num){ return memo + num; }, 0);
    
    u.map(sponsors[distributor.id], function (id) {
        child = distributors[id];
        if (child && child.commissionPeriods && child.roleCode === 'R') {
        volume += u.reduce(u.values(child.commissionPeriods), function(memo, num){ return memo + num; }, 0);
        }
    });
    return volume;
}

function getActiveTeamHandlers(ids, distributors) {
    var count = 0,
    now = new Date();
    
    u.map(ids, function(id) {
        var total = 0;
        child = distributors[id];
        
        if (child && child.roleCode === 'D' && child.nextRenewalDate) {
        if (child.nextRenewalDate >= now) {
            count += 1;
        }
        }
    });
    return count;
}

Dashboard.prototype.getBebData = function(distributorId, callback){
    var options,
        firstDayOfThisMonth = utils.getFirstDayOfThisMonth(new Date()),
        table = "bonus.bonusm{YYYYMMDD}_ranks".replace('{YYYYMMDD}', firstDayOfThisMonth),
        sql,
        context = this.context || {};

    sql = "SELECT r.* FROM " + table + " r WHERE distributor_id = $1";

    options = {
        cache : {
            key : 'Dashboard_Beb' + distributorId,
            ttl : 60 * 15  // 15 minutes
        },
        sqlStmt: sql,
        sqlParams: [distributorId]
    };

    queryDbData.call(this, options, callback);
};

function queryDbData(options, callback){
    this.queryDatabase(
    options,
    function(error, result) {
        if (error) {
            callback(null, []);
            return;
        }
        try {
            callback(null, result.rows);
        } catch (exception) {
            console.log("Dashboard::getDashboardData exception: " + util.inspect(exception));
            callback(null, []);
        }
    });
}

function getCurrentCommissionPeriodPersonalVolume(currentCommissionPeriod, distributor, distributors, sponsors) {
    var volume = distributor.commissionPeriods[currentCommissionPeriod] || 0.00;;
    //    console.log("sponsors[" + distributor.id + "]: " + require('util').inspect(sponsors[distributor.id]));
    u.map(sponsors[distributor.id], function (id) {
        child = distributors[id];
        if (child && child.commissionPeriods && child.roleCode === 'R') {
        volume += (child.commissionPeriods[currentCommissionPeriod] || 0.00);
        }
    });
    return volume;
}

function getCurrentTeamVolumes(ids, currentCommissionPeriod, distributors) {
    var total = 0;
    u.map(ids, function(id) {
        var child = distributors[id];
        if (child) {
        total += (child.commissionPeriods[currentCommissionPeriod] || 0.00);
        }
    });
    return parseFloat(total).toFixed(2);
}


Dashboard.prototype.getFTOData = function (distributorId, callback) {
    var options,
    returnResult,
    sql;
    
    //    sql = "SELECT d.id, d.next_renewal_date, r.role_code role_code, to_char(u.entry_date, 'yyyy-mm-dd') enrollment_date, d.personal_sponsor_distributor_id, to_char(cv.state_date, 'yyyy-mm-01') commission_period, sum(cv.pvq) pv from users u, distributors d, data_management.commission_volume cv, roles_users ru, roles r where u.id = d.user_id and ru.user_id = d.user_id and ru.role_id = r.id and  d.user_id = cv.user_id and cv.state_date >= date_trunc('MONTH',now())::DATE - INTERVAL '2 months' group by d.id, to_char(cv.state_date, 'yyyy-mm-01'), d.personal_sponsor_distributor_id, r.role_code, to_char(u.entry_date, 'yyyy-mm-dd'), d.next_renewal_date having sum(cv.pvq) >= 0";

    sql = "SELECT d.id, d.next_renewal_date, r.role_code role_code, to_char(u.entry_date, 'yyyy-mm-dd') enrollment_date, d.personal_sponsor_distributor_id, to_char(cv.state_date, 'yyyy-mm-01') commission_period, sum(cv.pvq) pv from users u left join data_management.commission_volume cv on cv.user_id = u.id and cv.state_date >= date_trunc('MONTH',now())::DATE - INTERVAL '2 months', distributors d, roles_users ru, roles r where u.id = d.user_id and ru.user_id = d.user_id and ru.role_id = r.id group by d.id, to_char(cv.state_date, 'yyyy-mm-01'), d.personal_sponsor_distributor_id, r.role_code, to_char(u.entry_date, 'yyyy-mm-dd'), d.next_renewal_date";

    options = {
        cache : {
            key : 'Dashboard_FTO' + distributorId,
            ttl : 60 * 15  // 15 minutes
        },
        sqlStmt: sql,
        sqlParams: []
    };

    this.queryDatabase(
    options,
    function(error, result) {
        var distributors = {},
        sponsors = {};
        if (error) {
            callback(null, {});
            return;
        }
        try {
            callback(null, getResults(result.rows, distributorId));
        } catch (exception) {
            console.log("Dashboard::getFTOData exception: " + util.inspect(exception));
            callback(null, {});
        }
    });
};

function getMemberIdUnilevelArray(rootId, distributors, sponsors) {
    var memberIdUnilevelArray = [];
    var level = 0;
    var levelKey = "level-" + level;
    memberIdUnilevelArray[levelKey] = [rootId];

    while (memberIdUnilevelArray[levelKey] && memberIdUnilevelArray[levelKey].length > 0) {
    level += 1;
    levelKey = "level-" + level;
    prevLevelKey = "level-" + (level - 1);

    u.map(memberIdUnilevelArray[prevLevelKey], function (childId) {
        var child = distributors[childId];
        if (child && sponsors[child.id]) {
            memberIdUnilevelArray[levelKey] = u.union(memberIdUnilevelArray[levelKey] || [], sponsors[child.id]);
        }
        });
    }
    return memberIdUnilevelArray;
}

Dashboard.prototype.getNewdistributorsBEB = function(distributorId, resultCallback){
    var context = this.context || {},
        self = this,
        output = {};

    async.waterfall([
        function(callback) {
            self.getNewdistributorsByDaysBEB.call(self, distributorId, 30, callback);
        },
        function(newAdvisors30DaysData, callback){
            output['new-advisors-last-30-days'] = newAdvisors30DaysData;
            self.getNewdistributorsByDaysBEB.call(self, distributorId, 60, callback);
        },
        function(newAdvisors60DaysData, callback){
            output['new-advisors-last-60-days'] = newAdvisors60DaysData;
            self.getNewdistributorsByDaysBEB.call(self, distributorId, 90, callback);
        }
    ], function(newAdvisors90DaysData, callback){
        output['new-advisors-last-90-days'] = newAdvisors90DaysData;
        resultCallback(null, output);
    });
};

Dashboard.prototype.getNewdistributorsByDaysBEB = function(distributorId, days, callback){
    var options,
        firstDayOfThisMonth = utils.getFirstDayOfThisMonth(new Date()),
        sql,
        context = this.context || {};
    sql = "select * from mobile.get_report_organization_UL2($1, $2, null, null, 0) where entry_date > (CURRENT_DATE - INTERVAL '" + days + " days') and role_code='D' order by child_level, distributor_id";
    options = {
        cache : {
            key : 'Dashboard_new_distributors_' + distributorId + '_' + firstDayOfThisMonth + '_' + days,
            ttl : 60 * 15  // 15 minutes
        },
        sqlStmt: sql,
        sqlParams: [distributorId, firstDayOfThisMonth]
    };

    queryDbData.call(this, options, callback);
};

Dashboard.prototype.getNewdistributorsWnp = function(distributorId, callback){
    var options,
        sql,
        firstDayOfThisMonth = utils.getFirstDayOfThisMonth(new Date()),
        context = this.context || {};
    sql = "select * from mobile.get_report_organization_UL2($1, $2, null, null, 0) where entry_date >= date_trunc('day', current_date) and role_code='D' order by child_level, distributor_id";
    options = {
        cache : {
            key : 'Dashboard_new_distributors_wnp_' + distributorId + '_' + firstDayOfThisMonth,
            ttl : 60 * 15  // 15 minutes
        },
        sqlStmt: sql,
        sqlParams: [distributorId, firstDayOfThisMonth]
    };

    queryDbData.call(this, options, callback);
};

Dashboard.prototype.getShoppingReport = function (context, callback) {
    var date = utils.getFirstDayOfThisMonth(new Date()),
        distributorId = context.user.distributorId,
        options,
        sqlStmt;

    sqlStmt =  "SELECT * FROM mobile.get_report_organization_UL2($1, $2, $3, $4, $5) WHERE child_level < 2 AND role_code = 'R' or distributor_id = $6 ORDER BY child_level, role_code, distributor_id";
    
    options = {
        cache : {
            key : 'ShoppingReport_' + date + '_' + distributorId,
            ttl : 60 * 15 // 15 minutes
        },
    sqlStmt: sqlStmt,
        sqlParams: [distributorId, date, null, null, 1, distributorId]
    };

    this.queryDatabase(options, callback);
};

function getResults(rows, distributorId) {
    var activeSponsoredHandlerCount = 0,
    child,
    commissionPeriod,
    distributor,
    distributors = {},
    id,
    newSponsoredHandlerCount = 0,
    now = new Date(),
    currentCommissionPeriod = utils.getFirstDayOfMonthLine(now),
        memberIdUnilevelArray,
        personalSponsoredList,
    results,
        sixtyDaysAgo = new Date(),
        sponsors = {},
        threeMonthPV;

     results = {
     "personal-volume" : 0.00,
     "current-team-volumes"  : {
         "level-1"  :  0.00,
         "level-2"  :  0.00,
         "level-3"  :  0.00,
         "level-4"  :  0.00
     },
     "3-month-pv"  :  0,
     "active-until-date"  :  "",
     "active-personally-sponsored-handlers"  :  0,
     "active-team-handlers"  : {
         "level-1"  :  0,
         "level-2"  :  0,
         "level-3"  :  0,
         "level-4"  :  0,
     },
     "new-personally-sponsored-handlers"  :  0
     };
    
     rows.forEach(
     function (row) {
         id = row.id;
         commissionPeriod = row.commission_period;
         if (distributors[id]) {
         distributors[id].commissionPeriods[commissionPeriod] = row.pv;
         } else {
         distributors[id] = {
             id: id,
             nextRenewalDate: (row.next_renewal_date) ? new Date(row.next_renewal_date) : null,
             roleCode: row.role_code,
             enrollmentDate: (row.enrollment_date) ? new Date(row.enrollment_date) : null,
             commissionPeriods: {}
         };
         distributors[id].commissionPeriods[commissionPeriod] = row.pv;
         }
                 
         if (sponsors[row.personal_sponsor_distributor_id]) {
         sponsors[row.personal_sponsor_distributor_id].push(id);
         sponsors[row.personal_sponsor_distributor_id] = u.uniq(sponsors[row.personal_sponsor_distributor_id]);
         } else {
         sponsors[row.personal_sponsor_distributor_id] = [id];
         }
     });
     /*
console.log("distributors: " + require('util').inspect(distributors));
console.log("sponsors: " + require('util').inspect(sponsors));
console.log("distributors[" + distributorId + "]: " + require('util').inspect(distributors[distributorId]));
     */

     distributor= distributors[distributorId];
     if (!distributor) {
     return results;
     }

     results["personal-volume"] = getCurrentCommissionPeriodPersonalVolume(currentCommissionPeriod, distributor, distributors, sponsors);
     results["3-month-pv"] = get3MonthPersonalVolume(distributor, distributors, sponsors);
     results["active-until-date"] = (distributors.nextRenewalDate) ? distributors.nextRenewalDate : "Not Active";


     memberIdUnilevelArray = getMemberIdUnilevelArray(distributorId, distributors, sponsors);
     //     console.log("\nmemberIdUnilevelArray: " + require('util').inspect(memberIdUnilevelArray));
     
     results["current-team-volumes"]["level-1"] = getCurrentTeamVolumes(memberIdUnilevelArray["level-1"], currentCommissionPeriod, distributors);
     results["current-team-volumes"]["level-2"] = getCurrentTeamVolumes(memberIdUnilevelArray["level-2"], currentCommissionPeriod, distributors);
     results["current-team-volumes"]["level-3"] = getCurrentTeamVolumes(memberIdUnilevelArray["level-3"], currentCommissionPeriod, distributors);
     results["current-team-volumes"]["level-4"] = getCurrentTeamVolumes(memberIdUnilevelArray["level-4"], currentCommissionPeriod, distributors);

     results["active-team-handlers"]["level-1"] = getActiveTeamHandlers(memberIdUnilevelArray["level-1"], distributors);
     results["active-team-handlers"]["level-2"] = getActiveTeamHandlers(memberIdUnilevelArray["level-2"], distributors);
     results["active-team-handlers"]["level-3"] = getActiveTeamHandlers(memberIdUnilevelArray["level-3"], distributors);
     results["active-team-handlers"]["level-4"] = getActiveTeamHandlers(memberIdUnilevelArray["level-4"], distributors);

     // active sponsored handler count and new handler in last 60 days ago count
     personalSponsoredList = sponsors[distributorId] || [];

     //  console.log("personalSponsoredList: " + require('util').inspect(personalSponsoredList));

     sixtyDaysAgo.setDate(now.getDate() - 60);
     u.map(personalSponsoredList, function (childId) {
         child = distributors[childId];
         if (child) {
         if (child.roleCode === 'D') {
             if (child.nextRenewalDate && child.nextRenewalDate >= now) {
             activeSponsoredHandlerCount += 1;
             }
             
             if (child.enrollmentDate && child.enrollmentDate >= sixtyDaysAgo) {
             newSponsoredHandlerCount += 1;
             }
         }
         }
     });

     results["active-personally-sponsored-handlers"] = activeSponsoredHandlerCount;
     results["new-personally-sponsored-handlers"] = newSponsoredHandlerCount;
        
     // fix all numbers to 2 decimal spaces
     results["personal-volume"] = parseFloat(results["personal-volume"]).toFixed(2);
     results["3-month-pv"] = parseFloat(results["3-month-pv"]).toFixed(2);
        
     // TODO later
     //     results["current-team-volume"] = '';
        
     //console.log("results: " + require('util').inspect(results));
     return results;
}

Dashboard.prototype.getOwnData = function(distributorId, callback){
    var options,
        firstDayOfThisMonth = utils.getFirstDayOfThisMonth(new Date()),
        sql,
        context = this.context || {};

    sql = "select * from mobile.get_report_organization_UL2($1, $2, null, null, 0) where child_level = 0";
    options = {
        cache : {
            key : 'Dashboard_own_organization_DATA_' + distributorId + '_' + firstDayOfThisMonth,
            ttl : 60 * 15  // 15 minutes
        },
        sqlStmt: sql,
        sqlParams: [distributorId, firstDayOfThisMonth]
    };

    queryDbData.call(this, options, callback);
};

/**
 *
 * @param  {Obj}   options
 * {
 *     context:
 *     distributorId:
 *     roleCode:
 *     isFirstLevel: boolean
 * }
 * @param  {Function} callback [description]
 * @return {array}            [description]
 */
function countUserByEnrollmentDateWithOptions(options, callback){
    var context = options.context,
        logger = context.logger,
        distributorId = options.distributorId,
        roleCode = options.roleCode,
        isFirstLevel = options.isFirstLevel, // true:firstLevel , false: group
        sqlStmt = '',
        sqlParams = [],
        error;

        sqlStmt +=" SELECT to_char(u.entry_date, 'YYYY-MM') date,  count(d.id) count";
        sqlStmt +=" FROM get_row_distributor_children($1) AS tree";
        sqlStmt +=" INNER JOIN  distributors d ON tree.child_id = d.id ";
        sqlStmt +=" INNER JOIN users u ON d.user_id = u.id  AND u.status_id = 1 ";
        sqlStmt +=" INNER JOIN roles_users ru ON ru.user_id = u.id";
        sqlStmt +=" INNER JOIN roles r ON r.id = ru.role_id";
        sqlStmt +=" WHERE  u.entry_date >= date_trunc('MONTH',now())::DATE - INTERVAL '3 months'";
        sqlStmt += (isFirstLevel ? " AND tree.distance = 1 " : "");
        sqlStmt +=" AND r.role_code = $2 "
        sqlStmt +=" GROUP BY date ";
        sqlStmt +=" ORDER BY date;";

        sqlParams = [distributorId, roleCode];

        DAO.queryDatabase(context,
            {sqlStmt: sqlStmt, sqlParams: sqlParams},
            function(error, result){
                if(error){
                    callback(error);
                    return;
                }
                callback(null, result.rows);
        });
}


function fillZero(arr){
    var dates = u.map([0,1,2,3], function(num){
        return moment().add(-1*num, 'months').format('YYYY-MM');
    });


    u.each(u.difference(dates, u.pluck(arr, 'date')),
        function(date){
            arr.push({date: date, count:0});
    });

    return u.sortBy(arr, 'date');
}

/**
 * the number of user on enrollment date
 * @param  {Obj}   options
 * {
 *     distributorId:
 *     roleCode:
 * }
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Dashboard.prototype.countUserByEnrollmentDate = function(options, callback) {
    var context = this.context,
        logger = context.logger,
        distributorId = options.distributorId,
        roleCode =  options.roleCode,
        error,
        result = {};

        async.waterfall([
            function(callback){
                countUserByEnrollmentDateWithOptions({
                    context: context,
                    roleCode: roleCode,
                    distributorId: distributorId,
                    isFirstLevel: true
                }, function(error, data){
                    if(error){
                        callback(error);
                        return;
                    }
                    result['first-level'] = fillZero(data);
                    callback();
                });
            },
            function(callback){
                countUserByEnrollmentDateWithOptions({
                    context: context,
                    roleCode: roleCode,
                    distributorId: distributorId,
                    isFirstLevel: false
                }, function(error, data){
                    if(error){
                        callback(error);
                        return;
                    }
                    result.group = fillZero(data);
                    callback(null, result);
                });
            }
        ], callback);

};

/**
 *
 * @param  {Obj}   options
 * {
 *     context:
 *     distributorId:
 *     isFirstLevel: boolean
 * }
 * @param  {Function} callback [description]
 * @return {array}            [description]
 */
function countOrderByMonthWithOptions(options, callback){
    var context = options.context,
        logger = context.logger,
        distributorId = options.distributorId,
        isFirstLevel = options.isFirstLevel, // personal or group
        sqlStmt = '',
        sqlParams = [],
        error;

        sqlStmt +=" SELECT count(d.id) count";
        sqlStmt +=" FROM get_row_distributor_children($1) AS tree";
        sqlStmt +=" INNER JOIN  distributors d ON tree.child_id = d.id ";
        sqlStmt +=" INNER JOIN users u ON d.user_id = u.id  AND u.status_id = 1 ";
        sqlStmt +=" INNER JOIN orders o ON o.user_id = d.user_id ";
        sqlStmt +=" WHERE  o.order_date >= date_trunc('MONTH',now())::DATE ";
        sqlStmt += (isFirstLevel ? " AND tree.distance = 1 " : "");
        sqlStmt +=" AND o.payment_state = 'paid' "

        sqlParams = [distributorId];

        DAO.queryDatabase(context,
            {sqlStmt: sqlStmt, sqlParams: sqlParams},
            function(error, result){
                if(error){
                    callback(error);
                    return;
                }
                if(u.isArray(result.rows) && result.rows.length > 0){
                    callback(null, result.rows[0].count);
                    return;
                }
                callback(null, 0);
        });
}


Dashboard.prototype.countOrderByMonth = function(options, callback){
    var context = this.context,
        logger = context.logger,
        distributorId = options.distributorId,
        error,
        result = {};

        async.waterfall([
            function(callback){
                countOrderByMonthWithOptions({
                    context: context,
                    distributorId: distributorId,
                    isFirstLevel: true
                }, function(error, data){
                    if(error){
                        callback(error);
                        return;
                    }
                    result['first-level'] = data;
                    callback();
                });
            },
            function(callback){
                countOrderByMonthWithOptions({
                    context: context,
                    distributorId: distributorId,
                    isFirstLevel: false
                }, function(error, data){
                    if(error){
                        callback(error);
                        return;
                    }
                    result.group =  data;
                    callback(null, result);
                });
            }
        ], callback);

};


/**
 *
 * @param  {Obj}   options
 * {
 *     context:
 *     distributorId:
 *     isFirstLevel: boolean
 * }
 * @param  {Function} callback [description]
 * @return {array}            [description]
 */
function countActiveDistributorWithOptions(options, callback){
    var context = options.context,
        logger = context.logger,
        distributorId = options.distributorId,
        isFirstLevel = options.isFirstLevel, // personal or group
        sqlStmt = '',
        sqlParams = [],
        error;

        sqlStmt +=" SELECT count(d.id) count";
        sqlStmt +=" FROM get_row_distributor_children($1) AS tree";
        sqlStmt +=" INNER JOIN  distributors d ON tree.child_id = d.id ";
        sqlStmt +=" INNER JOIN users u ON d.user_id = u.id  AND u.status_id = 1 ";
        sqlStmt +=" WHERE  d.next_renewal_date >= date_trunc('MONTH',now())::DATE - INTERVAL '2 months'";
        sqlStmt += (isFirstLevel ? " AND tree.distance = 1 " : "");

        sqlParams = [distributorId];

        DAO.queryDatabase(context,
            {sqlStmt: sqlStmt, sqlParams: sqlParams},
            function(error, result){
                if(error){
                    callback(error);
                    return;
                }
                if(u.isArray(result.rows) && result.rows.length > 0){
                    callback(null, result.rows[0].count);
                    return;
                }
                callback(null, 0);
        });
}


Dashboard.prototype.countActiveDistributor = function(options, callback){
    var context = this.context,
        logger = context.logger,
        distributorId = options.distributorId,
        error,
        result = {};

        async.waterfall([
            function(callback){
                countActiveDistributorWithOptions({
                    context: context,
                    distributorId: distributorId,
                    isFirstLevel: true
                }, function(error, data){
                    if(error){
                        callback(error);
                        return;
                    }
                    result['first-level'] = data;
                    callback();
                });
            },
            function(callback){
                countActiveDistributorWithOptions({
                    context: context,
                    distributorId: distributorId,
                    isFirstLevel: false
                }, function(error, data){
                    if(error){
                        callback(error);
                        return;
                    }
                    result.group =  data;
                    callback(null, result);
                });
            }
        ], callback);

};


/**
 *
 * @param  {Obj}   options
 * {
 *     context:
 *     distributorId:
 * }
 * @param  {Function} callback [description]
 * @return {array}            [description]
 */
function getRecentOrdersWithOptions(options, callback){
    var context = options.context,
        logger = context.logger,
        distributorId = options.distributorId,
        limit = options.limit || 25,
        offset = options.offset || 0,
        sqlStmt = '',
        sqlParams = [],
        error;

    sqlStmt +=" SELECT r.role_code, o.number, o.total, o.payment_total, o.state , o.payment_state, o.shipment_state, o.order_date, o.completed_at,( SELECT  greatest(coalesce(sum(li.q_volume), 0) + coalesce(sum(li.adj_qv), 0), 0) cv FROM line_items li WHERE li.order_id = o.id) AS cv ";
    sqlStmt +=" FROM orders o ";
    sqlStmt +=" INNER JOIN distributors d  ON o.user_id = d.user_id ";
    sqlStmt +=" INNER JOIN roles_users ru ON ru.user_id = d.user_id";
    sqlStmt +=" INNER JOIN roles r ON r.id = ru.role_id";
    sqlStmt +=" WHERE ( d.id =$1 OR d.id IN (select child_id FROM get_row_distributor_children($1)) )";
    sqlStmt +=" AND o.payment_state <> 'failed' ";
    sqlStmt +=" AND o.state not in  ('cancelled', 'cart') ";
    sqlStmt +=" ORDER BY o.order_date DESC ";
    sqlStmt +=" LIMIT " + limit;
    sqlStmt +=" OFFSET " + offset;

    sqlParams = [distributorId];

    DAO.queryDatabase(context,
        {sqlStmt: sqlStmt, sqlParams: sqlParams},
        function(error, result){
            if(error){
                callback(error);
                return;
            }
            if(u.isArray(result.rows)){
                callback(null, result.rows);
                return;
            }
            callback(null, []);
        });
}

/**
 *
 * we have 3 status related to order_state, payment_state and shipment_state. From user perspective,
 * it's confusing and difficult to understand.
 * To help make things easier to understand, the following 5 statuses were proposed:
 *
 * open: orders' payment_state in balance_due are open
 *
 * paid: orders' payment_state in (credit_owed, paid) are paid but not yet shipped, e.g. shipment_state is ready
 *
 * shipped: orders' shipment_state is shipped but orders' state is 'complete'
 *
 * awaiting_return: orders in 'awaiting_return'
 *
 * returned: orders state in 'returned' or 'refund'
 *
 * * @param order {state, payment_state, shipment_state}
 */
function generateOrderState(order){
    if(!order){
        return '';
    }

    if(['returned', 'refund'].indexOf(order.state) >= 0){
        return 'returned';
    }

    if('awaiting_return' === order.state){
        return 'awaiting_return';
    }

    if('complete' === order.state && 'shipped' === order.shipment_state){
        return 'shipped';
    }

    if(['credit_owed', 'paid'].indexOf(order.payment_state) >= 0 && 'shipped' !== order.shipment_state){
        return 'paid';
    }

    if('balance_due' === order.payment_state){
        return 'open';
    }


    return '';


}

Dashboard.prototype.getRecentOrders= function(options, callback){
    var context = this.context,
        logger = context.logger,
        distributorId = options.distributorId,
        data = [],
        error;

        getRecentOrdersWithOptions({
            context:context,
            distributorId: distributorId
        }, function(error, result){
            if(error){
                callback(error);
                return;
            }
            u.map(result, function(item){
               data.push({
                   order_number: item.number,
                   order_total: item.total,
                   payment_total: item.payment_total,
                   order_date: item.order_date,
                   completed_at: item.completed_at,
                   state: generateOrderState(item),
                   commission_volume: item.cv,
                   role_code: item.role_code

               });
            });

            callback(null, data);
        });
};


/**
 *
 * @param  {Obj}   options
 * {
 *     context:
 *     distributorId:
 *     isFirstLevel: boolean
 * }
 * @param  {Function} callback [description]
 * @return {array}            [description]
 */
function getMonthlyCommissionsWithOptions(options, callback){
    var context = options.context,
        logger = context.logger,
        distributorId = options.distributorId,
        isFirstLevel = options.isFirstLevel, // personal or group
        sqlStmt = '',
        sqlParams = [],
        error;

        sqlStmt +=" SELECT greatest(coalesce(sum(li.q_volume), 0) + coalesce(sum(li.adj_qv), 0), 0) cv";
        sqlStmt +=" FROM get_row_distributor_children($1) AS tree";
        sqlStmt +=" INNER JOIN  distributors d ON tree.child_id = d.id ";
        sqlStmt +=" INNER JOIN orders o ON o.user_id = d.user_id ";
        sqlStmt +=" LEFT JOIN line_items li ON li.order_id = o.id ";
        sqlStmt +=" WHERE  o.order_date >= date_trunc('MONTH',now())::DATE ";
        sqlStmt += (isFirstLevel ? " AND tree.distance = 1 " : "");
        sqlStmt +=" AND o.payment_state = 'paid' "

        sqlParams = [distributorId];

        DAO.queryDatabase(context,
            {sqlStmt: sqlStmt, sqlParams: sqlParams},
            function(error, result){
                if(error){
                    callback(error);
                    return;
                }
                if(u.isArray(result.rows) && result.rows.length > 0){
                    callback(null, result.rows[0].cv);
                    return;
                }
                callback(null, 0);
        });
}


Dashboard.prototype.getMonthlyCommissions = function(options, callback){
    var context = this.context,
        logger = context.logger,
        distributorId = options.distributorId,
        error,
        result = {};

        async.waterfall([
            function(callback){
                getMonthlyCommissionsWithOptions({
                    context: context,
                    distributorId: distributorId,
                    isFirstLevel: true
                }, function(error, data){
                    if(error){
                        callback(error);
                        return;
                    }
                    result['first-level'] = data;
                    callback();
                });
            },
            function(callback){
                getMonthlyCommissionsWithOptions({
                    context: context,
                    distributorId: distributorId,
                    isFirstLevel: false
                }, function(error, data){
                    if(error){
                        callback(error);
                        return;
                    }
                    result.group =  data;
                    callback(null, result);
                });
            }
        ], callback);

};

Dashboard.prototype.getThreeMonthPV = function(options, callback){
    var context = this.context,
        logger = context.logger,
        distributorId = options.distributorId,
        error,
        sqlStmt,
        sqlParams,
        result = {};

        this.getBebData(distributorId,
            function(error, result){
                if(error){
                    callback(error);
                    return;
                }
                if(u.isArray(result) && result.length > 0){
                    var row = result[0];
                    var detailsObj = utils.parseJson(row.details, {});
                    if(detailsObj['rolling-three-month-pv']){
                        callback(null, detailsObj['rolling-three-month-pv']);
                        return;
                    }
                }
                callback(null, 0);
        });
};


function countDownlineWithOptions(options, callback){
    var context = options.context;
    var distributorId = options.distributorId;

    var sqlStmt = '';
    var sqlParams = [];
    var data = {'D': {'total-count':0, 'active-count':0}, 'R': {'total-count':0, 'active-count':0}};

    sqlStmt +=" SELECT r.role_code, COUNT(d.id) AS total_count,  "
    sqlStmt +=" SUM(CASE WHEN  (CASE  WHEN r.role_code = 'D'  THEN date_trunc('day', COALESCE(d.special_distributor_next_renewal_date,  TIMESTAMP '2015-01-01')) >= date_trunc('day', now()) AND date_trunc('day', COALESCE(d.next_renewal_date,  TIMESTAMP '2015-01-01')) >= date_trunc('day', now())  WHEN r.role_code = 'R'  THEN  date_trunc('day', COALESCE(d.next_renewal_date,  TIMESTAMP '2015-01-01')) >= date_trunc('day', now())  ELSE false  END) THEN 1  ELSE 0  END) AS active_count "
    sqlStmt +=" FROM get_row_distributor_children($1) t "
    sqlStmt +=" INNER JOIN distributors d ON d.id = t.child_id "
    sqlStmt +=" INNER JOIN users u ON d.user_id = u.id  AND u.status_id = 1 "
    sqlStmt +=" INNER JOIN roles_users ru ON ru.user_id = u.id "
    sqlStmt +=" INNER JOIN roles r ON r.id= ru.role_id "
    sqlStmt +=" GROUP BY r.role_code "

    sqlParams = [distributorId];

    DAO.queryDatabase(context,
        {sqlStmt: sqlStmt, sqlParams: sqlParams},
        function(error, result){
            if(error){
                callback(error);
                return;
            }
            if(u.isArray(result.rows) && result.rows.length > 0){
                result.rows.forEach(function(item){
                    data[item.role_code]['total-count'] = item.total_count;
                    data[item.role_code]['active-count'] = item.active_count;
                });
            }
            callback(null, data);
    });
}

Dashboard.prototype.countDownline = function(options, callback){
    var context = this.context;
    var distributorId = options.distributorId;

    countDownlineWithOptions({context: context, distributorId: distributorId}, callback);

};

function listInactiveDownlineWithOptions(options, callback){
    var context = options.context;
    var distributorId = options.distributorId;
    var period = options.period; //current|previous|twomonths
    var limit  = options.limit;
    var offset = options.offset;
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
 

    sqlSelectCount = "SELECT COUNT(DISTINCT t.child_id) count ";
    sqlSelect = " SELECT d.id AS distributor_id, r.role_code, u.login, add.firstname|| ' ' || add.lastname  AS distributor_name, a.id AS image_id, a.attachment_file_name AS image_name ";
    
    sqlFrom +=' FROM get_row_distributor_children($1) t ';
    sqlFrom +=' INNER JOIN distributors d ON d.id = t.child_id  ';
    sqlFrom +=' INNER JOIN users u ON d.user_id = u.id  AND u.status_id = 1 ';
    sqlFrom +=' INNER JOIN roles_users ru ON ru.user_id = u.id ';
    sqlFrom +=' INNER JOIN roles r ON r.id= ru.role_id ';
    sqlFrom +=' LEFT JOIN users_home_addresses uha ON uha.user_id = u.id AND uha.is_default = true AND uha.active = true  ';
    sqlFrom +=' LEFT JOIN addresses add ON add.id = uha.address_id ';
    sqlFrom += ' LEFT JOIN assets a ON a.viewable_id = u.id AND a.viewable_type = \'User\' AND a.type=\'Avatar\' ';

    sqlOrder = " ORDER BY d.id ";


    sqlParams = [distributorId];




     async.waterfall([
        //where
        function(callback){

            if(period){
                switch(period){
                    case 'current':
                        sqlWhereConditions.push(" date_trunc('day', d.next_renewal_date) = date_trunc('day', now()) - '1 month'::interval " );
                        break;
                    case 'previous':
                        sqlWhereConditions.push(" date_trunc('day', d.next_renewal_date) = date_trunc('day', now()) - '2 month'::interval " );
                        break;
                    default:
                        sqlWhereConditions.push(" (d.next_renewal_date IS NULL OR date_trunc('day', d.next_renewal_date) <= date_trunc('day', now()) - '3 month'::interval ) " );

                }
            }else{
                sqlWhereConditions.push(" (d.next_renewal_date IS NULL OR date_trunc('day', d.next_renewal_date) < date_trunc('day', now()) ) " );
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

}

Dashboard.prototype.listInactiveDownline = function(options, callback){
    var context = this.context;
    var distributorId = options.distributorId;
    var period = options.period; //current|previous|twomonths
    var limit = options.limit;
    var offset = options.offset;

    listInactiveDownlineWithOptions({
        context:context,
        distributorId: distributorId,
        period: period,
        limit: limit,
        offset: offset
    }, callback);
}

function countMonthlySponsoredUserWithOptions(options, callback){
    var context = options.context;
    var distributorId = options.distributorId;

    var sqlStmt = '';
    var sqlParams = [];
    var data = {'D': 0, 'R': 0};
 
    sqlStmt += " SELECT r.role_code, ";
    sqlStmt += " SUM(CASE WHEN  (CASE  WHEN r.role_code = 'D'  THEN date_trunc('day', COALESCE(d.special_distributor_next_renewal_date,  TIMESTAMP '2015-01-01')) >= date_trunc('day', now()) AND date_trunc('day', COALESCE(d.next_renewal_date,  TIMESTAMP '2015-01-01')) >= date_trunc('day', now())  WHEN r.role_code = 'R'  THEN  date_trunc('day', COALESCE(d.next_renewal_date,  TIMESTAMP '2015-01-01')) >= date_trunc('day', now())  ELSE false  END) THEN 1  ELSE 0  END) AS cnt ";
    sqlStmt += " FROM distributors d ";
    sqlStmt += " INNER JOIN users u ON d.user_id = u.id  AND u.status_id = 1 ";
    sqlStmt += " INNER JOIN roles_users ru ON ru.user_id = u.id ";
    sqlStmt += " INNER JOIN roles r ON r.id= ru.role_id ";
    sqlStmt += " WHERE d.next_renewal_date IS NOT NULL ";
    sqlStmt += " AND d.personal_sponsor_distributor_id = $1 ";
    sqlStmt += " GROUP BY r.role_code ";

    sqlParams = [distributorId];

    DAO.queryDatabase(context,
        {sqlStmt: sqlStmt, sqlParams: sqlParams},
        function(error, result){
            if(error){
                callback(error);
                return;
            }
            if(u.isArray(result.rows) && result.rows.length > 0){
                result.rows.forEach(function(item){
                    data[item.role_code] = item.cnt;
                });
            }
            callback(null, data);
    });
}

Dashboard.prototype.countMonthlySponsoredUser = function(options, callback) {
    var context = this.context;
    var distributorId = options.distributorId;
    countMonthlySponsoredUserWithOptions({
        context:context,
        distributorId: distributorId
    }, callback);
};




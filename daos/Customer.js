/**
 * Customer DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var u = require('underscore');

function Customer(context) {
    DAO.call(this, context);
}

util.inherits(Customer, DAO);

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
 *     sponsorId:<Integer> required, 
 *     customerId:<Integer> optional, 
 *     limit:<Integer> optional, 
 *     offset:<Integer> optional, 
 *     userName:<String> optional,
 *     roleCode:<String> optional, //['R', 'D'], default: 'R'
 *     status:<String> optional, //['active', 'inactive']
 * }
 * @return {JSON} a json object
 */
Customer.prototype.getCustomers = function(options, callback) {
    var context = this.context,
        sqlSelect = "",
        sqlSelectCount = " SELECT COUNT(*) ",
        sqlFrom = "",
        sqlWhere = " WHERE ",
        sqlOffsetLimit = "",
        sqlGroup = "",
        sqlOrder = "",
        sqlParams = [],
        sqlWhereConditions = [],
        result = {
            meta: {
                limit: options.limit,
                offset: options.offset,
                count: 0
            },
            data: []
        },
        roleCode = options.roleCode || 'R',
        error;

    sqlSelect = " SELECT d.id, u.id user_id, u.status_id, add.lastname, add.firstname, add.phone, add.city, add.address1 as address, add.address2 as address2, uha.address_id as address_id, add.zipcode, COALESCE(s.name, '') AS state, COALESCE(s.id, 0) AS state_id, c.name country, c.id AS country_id, u.email, u.entry_date enrollment_date ";

    sqlFrom += " FROM users u  ";
    sqlFrom += " INNER JOIN statuses us ON us.id = u.status_id ";
    sqlFrom += " INNER JOIN roles_users ru ON ru.user_id = u.id ";
    sqlFrom += " INNER JOIN roles r ON r.id = ru.role_id ";
    sqlFrom += " INNER JOIN distributors d ON d.user_id = u.id ";
    sqlFrom += " INNER JOIN users_home_addresses uha ON uha.user_id = u.id and uha.is_default = true and uha.active = true ";
    sqlFrom += " INNER JOIN addresses add ON add.id = uha.address_id ";
    sqlFrom += " INNER JOIN countries c ON add.country_id = c.id ";
    sqlFrom += " LEFT JOIN states s ON add.state_id = s.id ";

    if (options.orderByEnrollmentDate) {
        sqlOrder = " ORDER BY enrollment_date DESC ";
    } else {
        sqlOrder = " ORDER BY add.firstname ASC, add.lastname ASC  ";
    }

    sqlWhereConditions.push(" add.firstname IS NOT NULL AND add.firstname != '' AND add.lastname IS NOT NULL AND add.lastname != '' ");
    

    async.waterfall([


        //where
        function(callback) {
            if (u.isString(options.status)) {
                sqlParams.push(options.status);
                sqlWhereConditions.push(" LOWER(us.name) = $" + sqlParams.length);
            }else{
                sqlWhereConditions.push(" u.status_id = '1' ");
            }

            if (options.sponsorId) {
                sqlParams.push(options.sponsorId);
                sqlWhereConditions.push(" d.personal_sponsor_distributor_id = $" + sqlParams.length);
            }

            if (options.customerId) {
                sqlParams.push(options.customerId);
                sqlWhereConditions.push(" d.id = $" + sqlParams.length);
            }

            if (roleCode) {
                sqlParams.push(roleCode);
                sqlWhereConditions.push(" r.role_code = $" + sqlParams.length);
            }

            if (options.userName) {
                sqlParams.push(options.userName+'%');
                sqlWhereConditions.push(" (add.firstname ILIKE $" + sqlParams.length +" OR add.lastname ILIKE $" + sqlParams.length +") ");
            }

            sqlWhere += sqlWhereConditions.join(" AND ");

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

            callback();
        },

        //select 
        function(callback) {
            DAO.queryDatabase(context, {
                sqlStmt: sqlSelect + sqlFrom + sqlWhere + sqlGroup + sqlOrder + sqlOffsetLimit,
                sqlParams: sqlParams
            }, function(error, res) {
                if (error) {
                    return callback(error);
                }
                result.data = res.rows;
                callback(null, result);
            });
        }
        
    ], callback);



};

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
 *     sponsorId:<Integer> required, 
 *     customerId:<Integer> optional, 
 *     limit:<Integer> optional, 
 *     offset:<Integer> optional, 
 *     userName:<String> optional
 * }
 * @return {JSON} a json object
 */
Customer.prototype.getOrders = function(options, callback) {
    var context = this.context,
        sqlSelect = "",
        sqlSelectCount = " SELECT COUNT(*) ",
        sqlFrom = "",
        sqlWhere = " WHERE ",
        sqlOffsetLimit = "",
        sqlGroup = "",
        sqlOrder = "",
        sqlParams = [],
        sqlWhereConditions = [],
        result = {
            meta: {
                limit: options.limit,
                offset: options.offset,
                count: 0
            },
            data: []
        },
        error;

    sqlSelect = " SELECT o.number order_number, o.order_date order_date, o.item_total item_total, o.adjustment_total adjustment_total, o.total order_total, o.state order_state, o.payment_state , d.id customer_id, add.lastname, add.firstname, v.pvq qv, v.pv_ul + v.pv_dt as cv ";

    sqlFrom += " FROM orders o ";
    sqlFrom += " INNER JOIN data_management.commission_volume v ON v.order_id = o.id ";
    sqlFrom += " INNER JOIN users u ON u.id = o.user_id ";
    sqlFrom += " INNER JOIN roles_users ru ON ru.user_id = u.id ";
    sqlFrom += " INNER JOIN roles r ON r.id = ru.role_id AND r.role_code = 'R'  ";
    sqlFrom += " INNER JOIN distributors d ON d.user_id = u.id ";
    sqlFrom += " INNER JOIN users_home_addresses uha ON uha.user_id = u.id and uha.is_default = true and uha.active = true ";
    sqlFrom += " INNER JOIN addresses add ON add.id = uha.address_id ";

    sqlOrder = " ORDER BY o.id DESC ";


    async.waterfall([


        //where
        function(callback) {
            if (options.sponsorId) {
                sqlParams.push(options.sponsorId);
                sqlWhereConditions.push(" d.personal_sponsor_distributor_id =  $" + sqlParams.length);
            }

            if (options.customerId) {
                sqlParams.push(options.customerId);
                sqlWhereConditions.push(" d.id =  $" + sqlParams.length);
            }

            if (options.userName) {
                sqlParams.push(options.userName+'%');
                sqlWhereConditions.push(" (add.firstname ILIKE  $" + sqlParams.length +" OR add.lastname ILIKE $" + sqlParams.length +") ");
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
            }, function(error, res ){
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

            callback();
        },

        //select 
        function(callback) {
            DAO.queryDatabase(context, {
                sqlStmt: sqlSelect + sqlFrom + sqlWhere + sqlGroup + sqlOrder + sqlOffsetLimit,
                sqlParams: sqlParams
            }, function(error, res) {
                if (error) {
                    return callback(error);
                }
                result.data = res.rows;
                callback(null, result);
            });
        }
        
    ], callback);

};



module.exports = Customer;
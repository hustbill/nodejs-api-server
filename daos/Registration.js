/**
 * Registration DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var daos = require('./index');

function Registration(context) {
    DAO.call(this, context);
}

util.inherits(Registration, DAO);

Registration.prototype.getRecentSignups = function (distributorId, offset, limit, callback) {
    var options;

    options = {
        cache : {
            key : 'RecentSignups_' + offset + '_' + limit + '_' + distributorId,
            ttl : 3600  // 1 hours = 60 * 60 * 1
        },
        sqlStmt: 'SELECT * FROM mobile.get_recent_signups($1, $2, $3)',
        sqlParams: [distributorId, limit, offset]
    };

    this.queryDatabase(options, callback);
};


/*
 * get unilevel children of distributor.
 *  options = {
 *      distributorId : <Integer>,
 *      offset : <Integer>,
 *      limit : <Integer>,
 *      sortBy : <string> entry-date, entry-date-desc, distributor-id, distributor-id-desc, first-name, first-name-desc, last-name, last-name-desc
 *  }
 */
Registration.prototype.getUnilevelChildren = function (options, callback) {
    var context = this.context;

    async.waterfall([
        function (callback) {
            var sqlStmt,
                queryDatabaseOptions;

            sqlStmt = "select d.id, d.user_id, a.firstname, a.lastname, u.entry_date, s.name as status from distributors d inner join users u on u.id = d.user_id left join statuses s on s.id=u.status_id left join users_home_addresses ua on d.user_id=ua.user_id left join addresses a on ua.address_id=a.id where ua.is_default=true and d.personal_sponsor_distributor_id=$1 order by ";

            switch (options.sortBy) {
                case 'entry-date':
                    sqlStmt += 'entry_date';
                    break;
                case 'entry-date-desc':
                    sqlStmt += 'entry_date desc';
                    break;
                case 'distributor-id':
                    sqlStmt += 'id';
                    break;
                case 'distributor-id-desc':
                    sqlStmt += 'id desc';
                    break;
                case 'first-name':
                    sqlStmt += 'firstname';
                    break;
                case 'first-name-desc':
                    sqlStmt += 'firstname desc';
                    break;
                case 'last-name':
                    sqlStmt += 'lastname';
                    break;
                case 'last-name-desc':
                    sqlStmt += 'lastname desc';
                    break;
                default:
                    sqlStmt += 'id desc';
            }
            
            sqlStmt += " offset $2 limit $3";
            queryDatabaseOptions = {
                sqlStmt : sqlStmt,
                sqlParams : [options.distributorId, options.offset, options.limit]
            };

            DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, result.rows);
            });
        },

        function (distributors, callback) {
            var userDao = daos.createDao('User', context);

            async.forEachSeries(distributors, function (distributor, callback) {
                userDao.getRolesOfUser({id : distributor.user_id}, function (error, roles) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (roles && roles.length) {
                        distributor.roleName = roles[0].name;
                    }

                    callback();
                });
            }, function (error) {
                callback(error, distributors);
            });
        }
    ], callback);
};


Registration.prototype.countUnilevelChildren = function (options, callback) {
    var context = this.context,
        queryDatabaseOptions = {
            sqlStmt : "select count(*) from distributors where personal_sponsor_distributor_id = $1",
            sqlParams : [options.distributorId]
        };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, result.rows[0].count);
    });
};

module.exports = Registration;

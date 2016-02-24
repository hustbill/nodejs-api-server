/**
 * /v2/admin/users/retail-role-change[?date=YYYYMM]
 * Get a user list of whom change to Retail custormer
 */
var async = require('async'),
    daos = require('../../../../../daos'),
    moment = require('moment'),
    userDao,
    roleDao,
    distributorDao;


function getQueryData(request) {
    var query = {},
        date = request.param('date');

    if (!date) {
        query['date-from'] = '1970-01-01';
        query['date-to'] = moment().format('YYYY-MM-DD');
    } else {
        if(moment(date,"YYYYMMDD").isValid()) {
            date = moment(date, "YYYYMMDD");
        } else if(moment(date,"YYYYMM").isValid()) {
            date = moment(date, "YYYYMM");
        } else {
            return new Error('Date format error');
        }
        query['date-from'] = date.year() + '-' + (date.month() + 1) + '-' + '01';
        query['date-to'] = date.year() + '-' + (date.month() + 1) + '-' + date.endOf('month').date();
    }
    return query;
}


function generateResponse(query, userList, userCount) {
    var result = {statusCode : 200};
    result.body = {
        "userList": userList
    };

    return result;
}

function getSqlStrFromList(list, key) {
    var values = ' ';

    list.forEach(function(ele) {
        values += ele[key];
        values += ','
    });
    values = values.substring(0, values.length - 1);
    return values;
}


function saveValuesToList(list, values, key) {
    list.forEach(function (ele, index) {
        ele[key] = values[index];
    });
}


function getAllChangedUserIds(context, query, next, callback) {
    var userIds = [],
        changedate = [],
        userList = [],
        userIdStr = '';

    userDao.getAllChangedUserIds(context, query, function (error, result) {
        if (error) {
            callback(error);
        }

        if (!result.length) {
            next(generateResponse(query, userList));
            return;
        }

        result.forEach(function (obj) {
            userList.push({"user-id" : obj.userid});
            changedate.push(obj.changedate);
        });
        saveValuesToList(userList, changedate, 'role-change-date');
        userIdStr = getSqlStrFromList(result, 'userid');
        callback(null, userIdStr, userList);
    });
}


function getDistributorIdsFromUserIds(context, userIdStr, userList, callback) {
    var distributorIds = [],
        distributorIdStr = '';

    distributorDao.getDistributorIdsFromUserIds(context, userIdStr, function (error, result) {
        if (error) {
            callback(error);
        }
        if (result.length) {
            result.forEach(function (obj) {
                distributorIds.push(obj.id);
            });
            saveValuesToList(userList, distributorIds, 'distributor-id');
            distributorIdStr = getSqlStrFromList(result, 'id');
        }
        callback(null, userIdStr, distributorIdStr, userList);
    });
}


function getMovedDownlines(context, userIdStr, distributorIdStr, userList, callback) {
    var downlineIds = [],
        downlineNewSponsorIds = [];

    userDao.getMovedDownlines(context, distributorIdStr, function (error, result) {
        if (error) {
            callback(error);
        }
        if (result.length) {
            userList.map(function(user) {
                result.forEach(function(res) {
                    if (user['distributor-id'] === res['distributor_id']) {
                        user['moved-downline-ids'] = res['downlines'];
                        user['downlines-new-sponsor-id'] = res['new_downlines_sponsor_id'];
                    }
                });
            });
        }
        callback(null, userIdStr, userList);
    });
}


function getUserNames(context, userIdStr, userList, callback) {
    var names = [],
        countries = [],
        isoes = [];

    userDao.getUserNames(context, userIdStr, function (error, result) {
        if (error) {
            callback(error);
        }
        if (result.length) {
            result.forEach(function(n) {
                names.push(n.firstname + " " + n.lastname);
                countries.push(n.country);
                isoes.push(n.iso);
            });
            saveValuesToList(userList, names, 'name');
            saveValuesToList(userList, countries, 'country');
            saveValuesToList(userList, isoes, 'iso');
        };
        callback(null, userList);
    });
}


function getRoleIds (context, query, callback) {
    var RETAIL_CUSTOMER_ROLE_CODE = 'R',
        DISTRIBUTOR_ROLE_CODE = 'D';

    async.parallel({
        getRetailCustomerRoleId : function (cb) {
            roleDao.getRoleByCode(RETAIL_CUSTOMER_ROLE_CODE, function (err, result) {
                if (err) {
                    cb(err);
                }
                cb(null, result);
            });
        },

        getDistributorRoleId : function (cb) {
            roleDao.getRoleByCode(DISTRIBUTOR_ROLE_CODE, function (err, result) {
                if (err) {
                    cb(err);
                }
                cb(null, result);
            });
        }
    }, function(err, results) {
        if (err) {
            callback(err);
        }
        if (!results.getRetailCustomerRoleId || !results.getDistributorRoleId) {
            callback(new Error('Can not get Retail customer id or Distributor id from DB'));
        } else {
            query.oldRoleId = results.getDistributorRoleId.id;
            query.newRoleId = results.getRetailCustomerRoleId.id;
            callback(null, query);
        }
    });
}


function sortByKey(array, key) {
    return array.sort(function(a, b) {
        var x = a[key];
        var y = b[key];
        return ((x < y) ? -1 : ((x > y) ? 1 : 0));
    });
}


/**
 * Return list of users whose role was change from Distributor to Retail customer
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        query = getQueryData(request),
        RETAIL_CUSTOMER_ROLE_ID = 6,
        DISTRIBUTOR_ROLE_ID = 2,
        userIds = [];

    roleDao = daos.createDao('Role', context);
    userDao = daos.createDao('User', context);
    distributorDao = daos.createDao('Distributor', context);

    if (query instanceof Error) {
        next(query);
        return;
    }

    async.waterfall([
        function (callback) {
            getRoleIds(context, query, callback);
        },

        function (query, callback) {
            getAllChangedUserIds(context, query, next, callback);
        },

        function (userIdStr, userList, callback) {
            getDistributorIdsFromUserIds(context, userIdStr, userList, callback);
        },

        function (userIdStr, distributorIdStr, userList, callback) {
            getMovedDownlines(context, userIdStr, distributorIdStr, userList, callback);
        },

        function (userIdStr, userList, callback) {
            getUserNames(context, userIdStr, userList, callback);
        }

    ], function (error, userList) {
        if(error) {
            next(error);
            return;
        }
        sortByKey(userList, 'distributor-id');
        next(generateResponse(query, userList));
    });
}

module.exports = get;
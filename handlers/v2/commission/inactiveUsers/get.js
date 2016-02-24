// GET /v2/commissions/inactive-users

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');

function getSponsorIdByDistributorId(id, sponsorIds){
    for (var i = sponsorIds.length - 1; i >= 0; i--) {
        if (sponsorIds[i].id === id) {
            return sponsorIds[i].personal_sponsor_distributor_id;
        };
    };
    return null;
}

function getNameByDistributorId(id, info){
    for (var i = info.length - 1; i >= 0; i--) {
        if (info[i].id === id) {
            return [info[i].firstname, info[i].lastname].join(' ');
        };
    };
    return null;
}

function getEmailByDistributorId(id, info){
    for (var i = info.length - 1; i >= 0; i--) {
        if (info[i].id === id) {
            return info[i].email;
        };
    };
    return null;
}

function getRollingAndDateByDistributorId(id, info){
    for (var i = info.length - 1; i >= 0; i--) {
        if (info[i].distributorId === id) {
            return {
                rollingThreeMonthPv : info[i].rollingThreeMonthPv,
                activeUntilDate : info[i].activeUntilDate
            };
        };
    };
    return null;
}
function getRenewDateById(id, info){
    for (var i = info.length - 1; i >= 0; i--) {
        if (info[i].distributorId === id) {
            return info[i].nextRenewalDate;
        };
    };
    return null;
}

function generateResponseBEB(ids, info, callback) {
    var result = {},
        body = [];

    if (!ids || ids.length === 0) {
        result.body = [];
        callback(null, result);
        return;
    }

    ids.forEach(function(id){
        var item = {},
            allInfo = getAllInfoById(id, info),
            details = JSON.parse(allInfo.details);
        item['distributor-id'] = id;
        item['sponsor-id'] = allInfo.sponsor_dist_id;
        item['sponsor-name'] = [allInfo.sponsor_first_name, allInfo.sponsor_last_name].join(' ');
        item['name'] = allInfo.full_name;
        item['email'] = allInfo.email;
        item['child-level'] = allInfo.child_level;
        item['rolling-three-month-pv'] = details['rolling-three-month-pv'];
        item['active-until-date'] = details['active-until-date'];
        item['country-iso'] = allInfo.country_name;

        body.push(item);
    });

    result.body = body;
    callback(null, result);
}

function generateResponseFTO(ids, info, renewDate, callback) {
    var result = {},
        body = [];

    if (!ids || ids.length === 0) {
        result.body = [];
        callback(null, result);
        return;
    };

    ids.forEach(function(id){
        var item = {},
            allInfo = getAllInfoById(id, info);
        item['distributor-id'] = id;
        item['sponsor-id'] = allInfo.sponsor_dist_id;
        item['sponsor-name'] = [allInfo.sponsor_first_name, allInfo.sponsor_last_name].join(' ');
        item['name'] = allInfo.full_name;
        item['email'] = allInfo.email;
        item['child-level'] = allInfo.child_level;
        item['next-renewal-date'] = getRenewDateById(id, renewDate);
        item['country-iso'] = allInfo.country_name;

        body.push(item);
    });

    result.body = body;
    callback(null, result);
}

function getAllInfoById(id, info){
    for (var i = info.length - 1; i >= 0; i--) {
        if (info[i].distributor_id === id) {
            return info[i];
        };
    };
    return {};
}

function isEarlier(date1, date2) {
    if (Date.parse(date1) <= Date.parse(date2)) {
        return true;
    }
    return false;
}

function getInactiveUsersBEB(date, rows, callback) {
    var firstDayOfNextMonth = utils.getfirstDayOfNextMonthLine(),
        result = [];
    if (!rows.length || rows.length === 0) {
        callback(null, []);
        return;
    }

    rows.forEach(function(row){
        if (!row.details) {
            return;
        }
        var details = JSON.parse(row.details),
            distributorId = row.distributor_id,
            rollingThreeMonthPv = details['rolling-three-month-pv'],
            activeUntilDate = details['active-until-date'];
        if (isEarlier(activeUntilDate, firstDayOfNextMonth) && rollingThreeMonthPv < 150 && isEarlier(date, activeUntilDate)) {
            result.push(distributorId);
        }
    });

    callback(null, result);
}

function getInactiveUsersFTO(rows, callback) {
    var date = new Date(),
        result = [],
        info = [];
    if (!rows.length || rows.length === 0) {
        callback(null, []);
        return;
    }
    
    rows.forEach(function (row) {
        if (isEarlier(row.next_renewal_date, date) || !row.next_renewal_date) {
            result.push(row.id);
            var item = {
                distributorId: row.id,
                nextRenewalDate: row.next_renewal_date
            }
            info.push(item);
        }
    });

    callback(null, result, info);
}

var getDataFunction = {
    getDataBEB : function (context, callback) {
        var distributorId = context.user.distributorId,
            date = context.input.date || utils.getFirstDayOfMonthLine(new Date()),
            info;
        var commissionDAO = daos.createDao('Commission', context);

        async.waterfall([
            function(callback) {
                commissionDAO.getInactiveId(date, distributorId, callback);
            },
            function(rows, callback){
                info = rows.rows;
                getInactiveUsersBEB(date, info, callback);
            },
            function(ids, callback){
                generateResponseBEB(ids, info, callback);
            }
        ], callback);
    },
    getDataFTO : function(context, callback){
        var distributorId = context.user.distributorId,
            date = context.input.date || utils.getFirstDayOfMonthLine(new Date()),
            info,
            renewDate;

        var commissionDAO = daos.createDao('Commission', context);

        async.waterfall([
            function(callback) {
                commissionDAO.getInactiveId(date, distributorId, callback);
            },
            function(rows, callback) {
                info = rows.rows;
                var distributorIds = [];
                try{
                    info.forEach(function(row){
                        distributorIds.push(row.distributor_id);
                    });
                }catch(error){
                    callback(error);
                    return;
                }

                commissionDAO.getNextRenewalDate(distributorIds, callback)
            },
            function(rows, callback){
                getInactiveUsersFTO(rows.rows, callback);
            },
            function(ids, data, callback){
                renewDate = data;
                generateResponseFTO(ids, info, renewDate, callback);
            }
        ], callback);
    }
}

/**
 * Return inactive-users
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        logger = context.logger,
        distributorId = request.query['distributor-id'],
        companyCode = request.get("x-company-code"),
        error,
        getDataFunctionName = 'getData' + companyCode;

    context.input = {
        date : request.query.date || utils.getFirstDayOfMonthLine(new Date())
    }

    if (!companyCode) {
        error = new Error("CompanyCode is empty");
        error.errorCode = 'InvalidCompanyCode';
        next(error);
        return;
    };

    if (!getDataFunction[getDataFunctionName]) {
        error = new Error("CompanyCode is Invalid");
        error.errorCode = 'InvalidCompanyCode';
        next(error);
        return;
    };

    getDataFunction[getDataFunctionName].call(this, context, function(error, result){
        if (error) {
            var body = {};
            body.body = [];
            next({
                statusCode : 200,
                body : body
            });
            return;
        };

        next({
            statusCode : 200,
            body : result
        });
    });
}

module.exports = get;
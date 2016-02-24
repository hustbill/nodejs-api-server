// GET /v2/commissions/inactive-users

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');

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

function getAllInfoByDistributorId(id, info){
    for (var i = info.length - 1; i >= 0; i--) {
        if (info[i].id === id) {
            return info[i];
        };
    };
    return {};
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

function generateResponseBEB(ids, sponsorIds, info, rollingAndDate, callback) {
    var result = {},
        body = [];

    if (!ids || ids.length === 0) {
        result.body = [];
        callback(null, result);
        return;
    };

    ids.forEach(function(id){        
        var item = {},
            allInfo = getAllInfoByDistributorId(id, info);
        item['distributor-id'] = id;
        item['sponsor-id'] = getSponsorIdByDistributorId(id, sponsorIds);
        item['sponsor-name'] = getNameByDistributorId(item['sponsor-id'], info);
        item['name'] = getNameByDistributorId(id, info);
        item['email'] = allInfo.email;
        var rollingAndDateById = getRollingAndDateByDistributorId(id, rollingAndDate);
        item['rolling-three-month-pv'] = rollingAndDateById.rollingThreeMonthPv;
        item['active-until-date'] = rollingAndDateById.activeUntilDate;
        item['country-iso'] = allInfo.iso;

        body.push(item);
    });

    result.body = body;
    callback(null, result);
}

function generateResponseFTO(ids, sponsorIds, info, nextRenewalDate, callback) {
    var result = {},
        body = [];

    if (!ids || ids.length === 0) {
        result.body = [];
        callback(null, result);
        return;
    };

    ids.forEach(function(id){        
        var item = {},
            allInfo = getAllInfoByDistributorId(id, info);
        item['distributor-id'] = id;
        item['sponsor-id'] = getSponsorIdByDistributorId(id, sponsorIds);
        item['sponsor-name'] = getNameByDistributorId(item['sponsor-id'], info);
        item['name'] = getNameByDistributorId(id, info);
        item['email'] = allInfo.email;
        item['next-renewal-date'] = getRenewDateById(id, nextRenewalDate);
        item['country-iso'] = allInfo.iso;

        body.push(item);
    });

    result.body = body;
    callback(null, result);
}

function isEarlier(date1, date2) {
    if (Date.parse(date1) <= Date.parse(date2)) {
        return true;
    }
    return false;
}

function getInactiveUsersBEB(date, rows, callback) {
    var firstDayOfNextMonth = utils.getfirstDayOfNextMonthLine(),
        result = [],
        info = [];
    if (!rows.length || rows.length === 0) {
        callback(null, [], []);
        return;
    }

    rows.forEach(function(row){
        var details = JSON.parse(row.details),
            distributorId = row.distributor_id,
            rollingThreeMonthPv = details['rolling-three-month-pv'],
            activeUntilDate = details['active-until-date'],
            item = {
                distributorId : distributorId,
                rollingThreeMonthPv : rollingThreeMonthPv,
                activeUntilDate : activeUntilDate
            };
            info.push(item);

        if (isEarlier(activeUntilDate, firstDayOfNextMonth) && rollingThreeMonthPv < 150 && isEarlier(date, activeUntilDate)) {
            result.push(distributorId);
        }
    });

    callback(null, result, info);
}

function getInactiveUsersFTO(rows, callback) {
    var date = new Date(),
        result = [],
        info = [];
    if (!rows || rows.length === 0) {
        callback('no inactive users');
    };
    rows.forEach(function(row){
        if (isEarlier(row.next_renewal_date, date) || !row.next_renewal_date) {
            result.push(row.id);
            var item = {
                distributorId : row.id,
                nextRenewalDate : row.next_renewal_date
            }
            info.push(item);
        }
    });
    callback(null, result, info);
}

var getDataFunction = {
    getDataBEB : function(context, callback){
        var logger = context.logger,
            distributorId,
            date = context.input.date || utils.getFirstDayOfMonthLine(new Date()),
            ids,
            sponsorIds,
            info,
            rollingAndDate,
            error;

        var commissionDAO = daos.createDao('Commission', context);

        async.waterfall([
            function(callback) {
                commissionDAO.getAdvisorDetailJson(date, distributorId, callback);
            },
            function(rows, callback){
                getInactiveUsersBEB(date, rows.rows, callback);
            },
            function(data, info, callback) {
                ids = data;
                rollingAndDate = info;
                commissionDAO.getSponsorId(ids, callback);
            },
            function(sponsorData, callback){
                sponsorIds = sponsorData;
                commissionDAO.getMailAndName(sponsorData, callback);
            },
            function(data, callback){
                info = data;
                generateResponseBEB(ids, sponsorIds, info, rollingAndDate, callback);
            }
        ], callback);
    },
    getDataFTO : function(context, callback){
        var logger = context.logger,
            distributorId,
            date = context.input.date || utils.getFirstDayOfMonthLine(new Date()),
            ids,
            sponsorIds,
            info,
            renewDate,
            date,
            error;

        var commissionDAO = daos.createDao('Commission', context);

        async.waterfall([
            function(callback) {
                commissionDAO.getAdvisorDetailJson(date, distributorId, callback);
            },
            function(rows, callback) {
                var distributorIds = [];
                rows.rows.forEach(function(row){
                    distributorIds.push(row.distributor_id);
                });
                commissionDAO.getNextRenewalDate(distributorIds, callback)
            },
            function(rows, callback){
                getInactiveUsersFTO(rows.rows, callback);
            },
            function(data, info, callback){
                ids = data;
                renewDate = info;
                commissionDAO.getSponsorId(ids, callback);
            },
            function(sponsorData, callback){
                sponsorIds = sponsorData;
                commissionDAO.getMailAndName(sponsorData, callback);
            },
            function(data, callback){
                info = data;
                generateResponseFTO(ids, sponsorIds, info, renewDate, callback);
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
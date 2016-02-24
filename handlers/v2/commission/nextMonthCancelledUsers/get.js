// GET /v2/commissions/next-month-cancelled-users

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var moment = require('moment');

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
                activeUntilDate : info[i].activeUntilDate,
                roleCode : info[i].roleCode,
                userId:info[i].userId
            };
        };
    };
    return null;
}

function generateResponse(ids, sponsorIds, info, rollingAndDate, callback) {
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
        item['role-code'] = rollingAndDateById.roleCode;
        item['user-id'] = rollingAndDateById.userId;
        item['contry-iso'] = allInfo.iso;

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

function getCancellUsers(date, rows, callback) {
    var firstDayOfNextMonth = utils.getfirstDayOfNextMonthLine(),
        result = [],
        info = [],
        cancelllDate = moment(date).subtract(1, 'days').format("YYYY-MM-DD");

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
                activeUntilDate : activeUntilDate,
                roleCode : row.role_code,
                userId:row.uid
            };
            info.push(item);

        if (rollingThreeMonthPv < 150 && activeUntilDate === cancelllDate) {
            result.push(distributorId);
        }
    });

    callback(null, result, info);
}

/**
 * Return cancell-users
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        logger = context.logger,
        distributorId = context.user.distributorId,
        ids,
        sponsorIds,
        info,
        rollingAndDate,
        companyCode = request.get("x-company-code"),
        date = request.query.date || utils.getFirstDayOfMonthLine(new Date()),
        error;

    var commissionDAO = daos.createDao('Commission', context);

    if (companyCode !== 'BEB') {
        var error = new Error("companyCode is Invalid");
            error.errorCode = 'InvalidCompanyCode';
            next(error);
            return;
    };

    async.waterfall([
        function(callback) {
            commissionDAO.getAdvisorDetailJson(date, distributorId, callback);
        },
        function(rows, callback){
            getCancellUsers(date, rows.rows, callback);
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
            generateResponse(ids, sponsorIds, info, rollingAndDate, callback);
        }
    ], function(error, result) {
        if (error) {
            next(error);
            return;
        }

        next(result);
    });
}

module.exports = get;
// /v2/dashboards/backoffices?company-code=FTO

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var u = require('underscore');

var getDataFunction = {
    getDataFTO : function(context, callback){
        var input = context.input;
        input.dashboardDao.getFTOData(
            input.distributorId,
            callback
        );
    },
    getDataMIO : function(context, callback){
        var input = context.input;
            distributorDao = daos.createDao('Distributor', context);
        async.waterfall([
            function(callback) {
                input.dashboardDao.getOwnData(input.distributorId, function(error, row){
                    if (!u.isArray(row) || row.length === 0 || !u.isString(row[0].details)) {
                        callback(null, {});
                        return;
                    };
                    callback(null, row[0].details);
                });
            },
            function(details, callback){
                if (!details || details === null || details.length === 0) {
                    callback(null, {})
                };
                var details = JSON.parse(details);
                callback(null, generateResponseMIO(details));
            }
        ], callback);
    },
    getDataWNP : function(context, callback){
        var output = {},
            input = context.input;
            distributorDao = daos.createDao('Distributor', context);
        async.waterfall([
            function(callback) {
                input.dashboardDao.getOwnData(input.distributorId, function(error, row){
                    if (!u.isArray(row) || row.length === 0 || !u.isString(row[0].details)) {
                        callback(null, {});
                        return;
                    };
                    callback(null, JSON.parse(row[0].details));
                });
            },
            function(result, callback){
                output.details = result;
                distributorDao.getPersonallySponsoredDistributors(input.distributorId, input.companyCode, callback);
            },
            function(result, callback){
                output.personallySponsoredAdvisors = result;
                callback(null, generateResponseWNP(output));
            }
        ], callback);
    },
    getDataBEB : function(context, callback){
        var bebData,
            input = context.input;
        async.waterfall([
            function(callback) {
                input.dashboardDao.getBebData(input.distributorId, callback)
            },
            function(rows, callback){
                bebData = rows;
                input.dashboardDao.getNewdistributorsBEB(input.distributorId, callback);
            },
            function(rows, callback) {
                //an object
                recentUsers = rows;
                getBebResults(bebData, recentUsers, callback)
            },
            function(result, callback) {
                dashboardResult = result;
                if (!dashboardResult) {
                    callback(null, {});
                    return;
                };
                if (dashboardResult['new-advisors-last-30-days'].length !== 0) {
                    dashboardResult['new-advisors-last-30-days'] = getRecntUsers(dashboardResult['new-advisors-last-30-days']);
                };

                if (dashboardResult['career-title-rank']) {
                    input.rankDao.getRankById(dashboardResult['career-title-rank'], function(error,rank){
                        dashboardResult['career-title-rank'] = rank.name;
                        callback(null, dashboardResult);
                        return;
                    });
                };
                callback(null, dashboardResult);
            }
        ], callback);
    }
};

function get(request, response, next) {
    var context = request.context,
        dashboardDao = daos.createDao('Dashboard', context),
        rankDao = daos.createDao('ClientRank', context),
        distributorId = context.user.distributorId,
        companyCode = request.get("x-company-code"),
        dashboardResult,
        recentUsers,
        getDataFunctionName = 'getData' + companyCode,
        getResultFunctionName = "getResult" + companyCode;

    context.input = {
        distributorId : distributorId,
        rankDao : rankDao,
        dashboardDao : dashboardDao,
        companyCode : companyCode
    }

    if (!companyCode) {
        var error = new Error("CompanyCode is empty");
        error.errorCode = 'InvalidCompanyCode';
        next({ 
                statusCode : 200, 
                body : {}
            });
        return;
    };

    if (!getDataFunction[getDataFunctionName]) {
        var error = new Error("CompanyCode is Invalid");
        error.errorCode = 'InvalidCompanyCode';
        next({ 
                statusCode : 200, 
                body : {}
            });
        return;
    };

    getDataFunction[getDataFunctionName].call(this, context, function(error, result){
        if (error) {
            next({ 
                statusCode : 200, 
                body : {}
            });
            return;
        };

        next({ 
            statusCode : 200, 
                body : result
            });
    });
}

function generateResponseWNP(result){
    var personallySponsoredAdvisors = result.personallySponsoredAdvisors,
        date = new Date(),
        firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1),
        newPersonallySponsoredConsultants = 0,
        activePersonallySponsoredConsultants = 0;

    if (!personallySponsoredAdvisors || personallySponsoredAdvisors.length === 0) {
        return {
            details : result.details,
            'new-personally-sponsored-consultants' : newPersonallySponsoredConsultants,
            'active-personally-sponsored-consultants' : activePersonallySponsoredConsultants
        };
    };

    personallySponsoredAdvisors.forEach(function(advisor){
        if (!advisor.details) {
            return;
        } else {
            var detail = JSON.parse(advisor.details),
                enrollmentDay = new Date(advisor.entry_date);
            if ( enrollmentDay >= firstDayOfMonth) {
                newPersonallySponsoredConsultants += 1;
            }
            if (!detail) {
                return;
            };
            if (detail['paid-rank'] !== "") {
                activePersonallySponsoredConsultants += 1;
            };
        }   
    });
    return {
        details : result.details,
        'new-personally-sponsored-consultants' : newPersonallySponsoredConsultants,
        'active-personally-sponsored-consultants' : activePersonallySponsoredConsultants
    };
}

function getRecntUsers(rows){
    var results = [];
    rows.forEach(function(row){
        var item = {
            "id"  :  row.distributor_id,
            "level"  :  row.child_level,
            "enrollment-date"  :  row.entry_date,
            "email"  :  row.email,
            "name"  :  row.full_name,
            "phone"  :  row.phone,
            "sponsor-id"  :  row.sponsor_dist_id,
            "sponsor-first-name"  :  row.sponsor_first_name,
            "sponsor-last-name" : row.sponsor_last_name
        };
        results.push(item);
    });
    return results;
}

function getBebResults(rows, recentUsers, callback){
    var result,
        row = {},
        details = {};

    if (!rows || !recentUsers || rows.length === 0) {
        callback(null, null);
        return;
    };

    row = rows[0];
    
    if (row.details) {
        details = JSON.parse(row.details);
    };

    result = {
        "new-advisors-last-30-days" : recentUsers['new-advisors-last-30-days'] || [],
        "new-advisors-last-60-days" : recentUsers['new-advisors-last-60-days'] || [],
        "new-advisors-last-90-days" : recentUsers['new-advisors-last-90-days'] || [],
        "career-title-rank" : details["career-title-rank"] || null,
        "active-until-date" : details["active-until-date"] || null,
        "paid-rank" : details["paid-rank"],
        "career-title-requirements" : details['career-title-requirements'] || [],
        "rolling-three-month-pv" : details['rolling-three-month-pv'],
        "career-title-active-until-date" : details['career-title-active-until-date'] || null
    }
    callback(null, result);
}

function generateResponseMIO(details){
    var result = {};
    if (!details){
        result.body = {};
        return result;
    }

    result.body = {
        'new-customer-this-month-count' : details['new-customer-this-month-count'] || 0,
        'new-angle-this-month-count':details['new-angle-this-month-count']|| 0,
        'monthly-sales':details['monthly-sales']|| 0,
        'total-team-sales': details['total-team-sales'] || 0
    }
    return result;
}
module.exports = get;
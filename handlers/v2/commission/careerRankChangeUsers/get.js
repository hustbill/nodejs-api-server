// GET /v2/commissions/career-rank-change-users

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');

function generateResponse(organizations, responseResult){
    var body = responseResult.body = [];
    organizations.forEach(function(organization){
        var item = {
            'distributor-id' : organization.distributor_id,
            'name' : organization.full_name,
            'email' : organization.email,
            'level' : organization.child_level,
            'sponsor-id' : organization.sponsor_dist_id,
            'sponsor-name' : [organization.sponsor_first_name, organization.sponsor_last_name].join(' '),
            'career-title-rank' : organization.details['career-title-rank'],
            'next-month-career-title-rank' : organization.details['next-month-career-title-rank'],
            'main-career-title-requirements' : organization.details['career-title-requirements']
        };
        body.push(item);
    });
    return responseResult;
}

function getCareerRankChangeUsers(data, callback) {
    //parse details
    var organizations = [],
        results = [];

    data.forEach(function (item) {
        if ( item.details && item.details !== "" ) {
            item.details = JSON.parse(item.details);
            organizations.push(item);
        }
    });

    organizations.forEach(function( organization ){
        if (organization.details['career-title-rank'] !== organization.details['next-month-career-title-rank']) {
            results.push(organization);
        };
    });

    callback(null, results);
}

/**
 * Return career-rank-change-users
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        logger = context.logger,
        distributorId = context.user.distributorId,
        companyCode = request.get("x-company-code"),
        organization,
        error,
        responseResult = { statusCode : 200 };

    var commissionDAO = daos.createDao('Commission', context);

    if (companyCode !== 'BEB') {
        var error = new Error("companyCode is Invalid");
            error.errorCode = 'InvalidCompanyCode';
            next(error);
            return;
    };

    async.waterfall([
        function (callback) {
            commissionDAO.getOrganizationULByDistributorId(distributorId, callback);
        },
        function (data, callback) {
            organizations = data.rows;

            if (organizations.length === 0) {
                responseResult.body = {};
                next(responseResult);
                return;                
            }

            getCareerRankChangeUsers(organizations, callback);
        }
    ], function(error, results) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(results, responseResult));
    });
}

module.exports = get;
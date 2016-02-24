// GET /v2/commissions/dates?periods=weekly,monthly,quarterly

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var u = require('underscore');

function generateResponse(retrieve, periodType, action, responseResult, callback) {
    if (retrieve) {
        action(
            function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }
                responseResult.body[periodType] = result;
                callback(null);
            }
        );
    } else {
        callback(null);
    }

}

/**
 * Return commission dates json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        commissionDao = daos.createDao('Commission', context),
        periods = request.query.periods,
        responseResult = {body: {}},
        error,
        weekly,
        monthly,
        quarterly;

    weekly = monthly = quarterly = true;

    if (periods) {
        periods = periods.toLowerCase();
        weekly = (periods.indexOf('weekly') !== -1);
        monthly = (periods.indexOf('monthly') !== -1);
        quarterly = (periods.indexOf('quarterly') !== -1);
    }

    if ((weekly || monthly || quarterly) === false) {
        error = new Error("commission period type is empty");
        error.statusCode = 400;
        next(error);
        return;
    }

    async.parallel([
        function (callback) {
            generateResponse(weekly,
                             'weekly',
                             commissionDao.getWeeklyDates.bind(commissionDao),
                             responseResult,
                             callback);
        },
        function (callback) {
            generateResponse(monthly,
                             'monthly',
                             commissionDao.getMonthlyDates.bind(commissionDao),
                             responseResult,
                             callback);
        },
        function (callback) {
            generateResponse(quarterly,
                             'quarterly',
                             commissionDao.getQuarterlyDates.bind(commissionDao),
                             responseResult,
                             callback);
        }
    ],	function (error, result) {
        var monthlyStartDateString,
	    monthlyStartDate,
	    oldMonthlyResult,
	    requiredYear,
	    requiredMonth,
	    requiredDay,
	    newMonthlyResult = {};

        if (error) {
            next(error);
            return;
        }

	if (context.config.application.commission && context.config.application.commission.monthlyStartDate) {
	    monthlyStartDateString = context.config.application.commission.monthlyStartDate;
	    requiredYear = parseInt(monthlyStartDateString.substr(0, 4), 10);
	    requiredMonth = parseInt(monthlyStartDateString.substr(4, 2), 10);
	    requiredDay  = parseInt(monthlyStartDateString.substr(6, 2), 10);
	    monthlyStartDate = new Date(requiredYear, requiredMonth - 1, requiredDay);
	    oldMonthlyResult = responseResult.body.monthly;

	    u.map(oldMonthlyResult, function (monthAndDayArray, year) {
		 var yyyy = parseInt(year, 10);
				       
		 u.map(monthAndDayArray, function (monthAndDay) {
		      var month = parseInt(monthAndDay.substr(0, 2), 10),
		          day = parseInt(monthAndDay.substr(2, 2), 10);

                      if ( new Date(yyyy, month - 1, day) >= monthlyStartDate ) {
			   if (newMonthlyResult[year]) {
			       newMonthlyResult[year].push(monthAndDay);
			   } else {
			       newMonthlyResult[year] = [monthAndDay];
			   }
		       }
		   });
	    });
	    responseResult.body.monthly = newMonthlyResult;	    
	}

        next(responseResult);
    });
}

module.exports = get;

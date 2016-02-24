// GET /v2/genealogy/dualteam[?distributorId=<distributorId>]

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var getRank = require('../../../../lib/constants').getRank;
var moment = require('moment');

/**
 * Validate the request.
 *
 * @method validateRequest
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function validateRequest(request, callback) {
    utils.validateParentChildRelationship(request, 'is_dt_parent_child', callback);
}

/**
 * Load dualteam tree
 *
 * @method loadDualteamTree
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function loadDualteamTree(request, callback) {
    var context = request.context,
        genealogyDao = daos.createDao('Genealogy', context),
        distributorId = context.user.childDistributorId || context.user.distributorId;

    genealogyDao.getDualteamTree(
        distributorId,
        function (error, result) {
            if (error) {
                callback(error);
                return;
            }
            context.result = result;
            callback(null);
        }
    );
}

function getEnrollmentCode(enrollmentStatus) {
    var enrollmentCode;

    if (enrollmentStatus === -1) {
        enrollmentCode = 'M';
    } else if (enrollmentStatus === 0) {
        enrollmentCode = 'B';
    } else if (enrollmentStatus === 1) {
        enrollmentCode = 'E';
    } else if (enrollmentStatus === 2) {
        enrollmentCode = 'P';
    } else if (enrollmentStatus === 3) {
        enrollmentCode = 'PR';
    } else {
        enrollmentCode = '';
    }
    return enrollmentCode;
}

function getResults(rows) {
    var activeStatus,
	activePVQ,
	entryDate,
	leftVolume,
	rightVolume,
	now,
	result = [];

    rows.forEach(function (row) {
	 if (row.distributor_id !== null) {
	     activePVQ = parseFloat(row.previous_month_pvq);
	     if (activePVQ <= 0) {
		 if (row.entry_date) {
		     now = moment();
		     entryDate = moment(row.entry_date);
		     if ((now.year() === entryDate.year()) && 
			 (now.month() === entryDate.month())) {
			 activePVQ = parseFloat(row.current_month_pvq);
		     }
		 }
	     }
	
	     if (activePVQ > 89) {
		 activeStatus = 'Y+';
	     } else if (activePVQ >= 50) {
		 activeStatus = 'Y';
	     } else {
		 activeStatus = 'N';
	     }

            row.prev_left_pvq_week = (isNaN(parseInt(row.prev_left_pvq_week, 10))) ? 0 : row.prev_left_pvq_week;
            row.current_left_pvq_week = (isNaN(parseInt(row.current_left_pvq_week, 10))) ? 0 : row.current_left_pvq_week;
            row.prev_right_pvq_week = (isNaN(parseInt(row.prev_right_pvq_week, 10))) ? 0 : row.prev_right_pvq_week;
            row.current_right_pvq_week = (isNaN(parseInt(row.current_right_pvq_week, 10))) ? 0 : row.current_right_pvq_week;
	    /*
	    row.prev1wk_prev_left_pvq_week = (isNaN(parseInt(row.prev1wk_prev_left_pvq_week, 10))) ? 0 : row.prev1wk_prev_left_pvq_week;
            row.prev1wk_current_left_pvq_week = (isNaN(parseInt(row.prev1wk_current_left_pvq_week, 10))) ? 0 : row.prev1wk_current_left_pvq_week;
            row.prev1wk_prev_right_pvq_week = (isNaN(parseInt(row.prev1wk_prev_right_pvq_week, 10))) ? 0 : row.prev1wk_prev_right_pvq_week;
            row.prev1wk_current_right_pvq_week = (isNaN(parseInt(row.prev1wk_current_right_pvq_week, 10))) ? 0 : row.prev1wk_current_right_pvq_week;

            row.prev2wk_prev_left_pvq_week = (isNaN(parseInt(row.prev2wk_prev_left_pvq_week, 10))) ? 0 : row.prev2wk_prev_left_pvq_week;
            row.prev2wk_current_left_pvq_week = (isNaN(parseInt(row.prev2wk_current_left_pvq_week, 10))) ? 0 : row.prev2wk_current_left_pvq_week;
            row.prev2wk_prev_right_pvq_week = (isNaN(parseInt(row.prev2wk_prev_right_pvq_week, 10))) ? 0 : row.prev2wk_prev_right_pvq_week;
            row.prev2wk_current_right_pvq_week = (isNaN(parseInt(row.prev2wk_current_right_pvq_week, 10))) ? 0 : row.prev2wk_current_right_pvq_week;

            leftVolume = [row.prev_left_pvq_week + row.current_left_pvq_week, 
			  row.prev1wk_prev_left_pvq_week + row.prev1wk_current_left_pvq_week].join('/');
	    //			  row.prev2wk_prev_left_pvq_week + row.prev2wk_current_left_pvq_week].join('/');
	    rightVolume = [row.prev_right_pvq_week + row.current_right_pvq_week, 
			   row.prev1wk_prev_right_pvq_week + row.prev1wk_current_right_pvq_week].join('/');
	    //			   row.prev2wk_prev_right_pvq_week + row.prev2wk_current_right_pvq_week].join('/');
	    */

	    leftVolume = row.prev_left_pvq_week + row.current_left_pvq_week;
	    rightVolume = row.prev_right_pvq_week + row.current_right_pvq_week;

            result.push({
                'distributor-id' : row.distributor_id,
                'lifetime-rank' : getRank(row.lifetime_rank) || '',
                'left-child-id' : row.left_child_id || '',
                'right-child-id' : row.right_child_id || '',
                'user-name' : row.user_name || '',
                'active-status' : activeStatus || '',
                'autoship-status' : row.autoship_status || '',
                'current-month-pv' : row.current_month_pvq || 0,
                'enrollment-status' : getEnrollmentCode(parseInt(row.enrollment_status, 10)) || '',
                'enrollment-date' : row.entry_date || '',
		'current-left-volume' : leftVolume,
                'current-right-volume' : rightVolume
            });
        }
    });
    return result;
}

/**
 * convert the database result rows into response object.
 *
 * @method generateResponse
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function generateResponse(request, callback) {
    if (!request.context.result.rows || !request.context.result.rows.length) {
        callback({
            statusCode : 200,
            body : {}
        });
        return;
    }

    callback({
        statusCode : 200,
        body : getResults(request.context.result.rows)
    });
}

/**
 * Return dualteam tree json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    async.series([
        function (callback) {
            validateRequest(request, callback);
        },
        function (callback) {
            loadDualteamTree(request, callback);
        },
        function (callback) {
            generateResponse(request, callback);
        }
    ], next);
}

module.exports = get;

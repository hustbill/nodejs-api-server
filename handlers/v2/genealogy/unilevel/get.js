// GET /v2/genealogy/unilevel[?distributorId=&ltdistributorId&gt]

var async = require('async');
var u = require('underscore');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var rankMap = require('../../../../lib/constants').rankMap;

/**
 * Validate the request.
 *
 * @method validateRequest
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function validateRequest(request, callback) {
    utils.validateParentChildRelationship(request, 'is_ul_parent_child', callback);
}

function fillStatusName(context, array, callback){
    var statusDAO = daos.createDao('Status', context);
    async.eachSeries(array,
        function(item, callback) {
            if (u.isNumber(item.status)) {
                statusDAO.getStatusById(item.status, function(error, status) {
                    item.status = status ? status.name : '';
                    callback();
                });
                return ;
            }

            item.status = '';

            callback();

        }, function(error) {
            callback();
        });
}

/**
 * Load unilevel tree
 *
 * @method loadUnilevelTree
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function loadUnilevelTree(request, callback) {
    var context = request.context,
        genealogyDao = daos.createDao('Genealogy', context),
        distributorId =  context.user.childDistributorId || context.user.distributorId;

    genealogyDao.getUnilevelTree(
        distributorId,
        function(error, result) {
            if (error) {
                callback(error);
                return;
            }
            context.result = result;
            callback(null);
        }
    );
}

function getTotalAndActiveTotal(request, callback) {
    var context = request.context,
        genealogyDao = daos.createDao('Genealogy', context),
        distributorId =  context.user.childDistributorId || context.user.distributorId;

    context.totalDistributor = {};

    async.series([
        function(callbackData) {
            genealogyDao.getTotalInOrganization(
                distributorId,
                function(error, result){
                    if (error) {
                        callbackData(error);
                        return;
                    }
                    context.totalDistributor.total = result.rows[0].count;
                    callbackData(null);
                }
            );
        },
        function(callbackData) {
            genealogyDao.getActiveTotalInOrganization(
                distributorId,
                function(error, result){
                    if (error) {
                        callbackData(error);
                        return;
                    }
                    context.totalDistributor.activeTotal = result.rows[0].count;
                    callbackData(null);
                }
            );
        },
    ], callback);
}

function splitChildrenByRoleCode(request, callback) {
    var context = request.context,
        row = context.result.rows[0],
        idAndRankAndName,
        item,
        distributorArray = [],
        retailArray = [],
        childrenInfoArray;

    if (row.children_info === null) {
        row.children = distributorArray;
        row['retail-children'] = retailArray;
        row['children-size'] = distributorArray.length;
        row['retail-children-size'] = retailArray.length;
        callback();
        return ;
    }

    try {
        childrenInfoArray = row.children_info.replace(/\"/g, '').split('),');
        childrenInfoArray.forEach(
            function(element) {
                idAndRankAndName = element.replace(/[\\|\(|\)|{|}]/g, '').split(',');
                item = {
                    id: parseInt(idAndRankAndName[0], 10),
		    // 'lifetime-rank': idAndRankAndName[1],
		    'lifetime-rank': idAndRankAndName[1],
		    'paid-rank': idAndRankAndName[8],
                    'children-size': parseInt(idAndRankAndName[2], 0),
                    'first-name': idAndRankAndName[3],
                    'last-name': idAndRankAndName[4],
                    'role-code': idAndRankAndName[5] || 'D',
                    'status': parseInt(idAndRankAndName[6], 10)
                };
                //retail customer
                if (item['role-code'] === 'R') {
                    retailArray.push(item);
                } else {
                    //TODO: 
                    distributorArray.push(item);
                }
            }
        );
        //

        row.children = distributorArray;
        row['retail-children'] = retailArray;
        row['children-size'] = distributorArray.length;
        row['retail-children-size'] = retailArray.length;

	callback();
	/*
        async.parallel([
            function(callback) {
                fillStatusName(context, row.children, callback);
            },
            function(callback) {
                fillStatusName(context, row['retail-children'], callback);
            },
            function(callback) {
                var statusDAO = daos.createDao('Status', context);
                if (u.isNumber(row.user_status_id)) {
                    statusDAO.getStatusById(row.user_status_id, function(error, status) {
                        row.user_status = status ? status.name : '';
                        callback();
                    });
                    return ;
                }
                row.user_status = '';
                callback();
            }
        ], function (err, results) {
            callback();
        });
        */

    } catch (exception) {
        callback();
        logger.error('getChildrenData for distributor(%i) get exception(%s)', distributorId, exception);
    }

}



/**
 * convert the database result rows into response object.
 *
 * @method generateResponse
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param callback {Function} callback function.
 */
function generateResponse(request, callback) {
    if (!request.context.result.rows || !request.context.result.rows.length) {
        callback({
            statusCode: 200,
            body: {}
        });
        return;
    }

    var context = request.context,
        row = context.result.rows[0],
        distributorId = context.user.childDistributorId || context.user.distributorId,
        result = {
            statusCode: 200
        };

    result.body = {
        active: row.active,
        'children-size': parseInt(row['children-size'], 10),
        'retail-children-size': parseInt(row['retail-children-size'], 10),
        id: parseInt(distributorId, 10),
	'lifetime-rank': row.lifetime_rank,
        'paid-rank': row.curr_m_paid_rank,
        'personal-sponsor-id': row.personal_sponsor_id,
        'renewel-date': row.renewel_date,
        'role-code': row.role_codes || 'D',
        'user-name': row.user_name,
        'first-name': row.first_name,
        'last-name': row.last_name,
	'status': row.user_status_id,
        children: row.children,
        'retail-children': row['retail-children'],
        'total-in-organization': context.totalDistributor.total,
        'total-active-in-organization':context.totalDistributor.activeTotal
    };

    callback(result);
}

/**
 * Return unilevel tree json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    async.series([

        function(callback) {
            validateRequest(request, callback);
        },
        function(callback) {
            loadUnilevelTree(request, callback);
        },
        function(callback) {
            splitChildrenByRoleCode(request, callback);
        },
        function(callback) {
            getTotalAndActiveTotal(request, callback);
        },
        function(callback) {
            generateResponse(request, callback);
        }
    ], next);
}

module.exports = get;
/**
 * Genealogy DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var utils = require('../lib/utils');

function Genealogy(context) {
    DAO.call(this, context);
}

util.inherits(Genealogy, DAO);

function callbackIgnoreDBRelationDoesNotExistError(callback) {
    return function (error, results) {
        if (error) {
            /*jslint regexp: true*/
            if (/^relation ".*" does not exist$/.test(error.message)) {
                callback(null, {rows : []});
            } else {
                callback(error);
            }
            /*jslint regexp: false*/

            return;
        }

        callback(null, results);
    };
}

Genealogy.prototype.getTotalInOrganization = function(distributorId, callback) {
    var options,
        firstDayOfThisMonth = utils.getFirstDayOfMonth(new Date());

    options = {
        cache : {
            key : 'TotalInOrganization' + distributorId,
            ttl : 60 * 5  // 5 minutes
        },
        sqlStmt: "SELECT count(*) FROM mobile.get_report_organization_UL2($1, $2, null, null, 0) where role_code='D' and child_level > 0",
        sqlParams: [distributorId, firstDayOfThisMonth]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
}

Genealogy.prototype.getActiveTotalInOrganization = function(distributorId, callback) {
    var options,
        firstDayOfThisMonth = utils.getFirstDayOfMonth(new Date());

    options = {
        cache : {
            key : 'ActiveTotalInOrganization' + distributorId,
            ttl : 60 * 5  // 5 minutes
        },
        sqlStmt: "SELECT count(*) FROM mobile.get_report_organization_UL2($1, $2, null, null, 0) where role_code='D' AND child_level > 0 AND rank_code > ''",
        sqlParams: [distributorId, firstDayOfThisMonth]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
}

Genealogy.prototype.getDualteamTree = function (distributorId, callback) {
    var options;

    options = {
        cache : {
            key : 'DualteamTree_' + distributorId,
            ttl : 60 * 5  // 5 minutes
        },
        //sqlStmt: 'SELECT * FROM mobile.get_dual_team_tree($1)',
		sqlStmt: 'SELECT * FROM get_left_right_vol_info($1)',
        sqlParams: [distributorId]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};

Genealogy.prototype.getDualteamTreePath = function (distributorId, childDistributorId, callback) {
    var options;

    options = {
        cache : {
            key : 'loadDualteamTreePath_' + distributorId + '-' + childDistributorId,
            ttl : 60 * 5  // 5 minutes
        },
        sqlStmt: 'SELECT * FROM mobile.get_dt_children_on_path($1, $2) order by height',
        sqlParams: [distributorId, childDistributorId]
    };

    this.queryDatabase(options, callback);
};

Genealogy.prototype.getUnilevelTree = function (distributorId, callback) {
	var options;

    options = {
        cache : {
            key : 'UnilevelTree_' + distributorId,
            ttl : 60 * 5  // 5 minutes
        },
        sqlStmt: 'SELECT * FROM mobile.get_unilevel_tree2($1)',
        sqlParams: [distributorId]
    };

    this.queryDatabase(options, callbackIgnoreDBRelationDoesNotExistError(callback));
};


Genealogy.prototype.getUnilevelTreePath = function (distributorId, childDistributorId, callback) {
    var options;

    options = {
        cache : {
            key : 'UnilevelTreePath_' + distributorId + '-' + childDistributorId,
            ttl : 60 * 5  // 5 minutes
        },
        sqlStmt: 'SELECT * FROM mobile.get_ul_children_on_path($1, $2) order by height',
        sqlParams: [distributorId, childDistributorId]
    };

    this.queryDatabase(options, callback);
};

Genealogy.prototype.isParentChild = function (distributorId, childDistributorId, storeProcedureName, callback) {
    var options;

    options = {
        cache : {
            key : storeProcedureName + distributorId + '-' + childDistributorId,
            ttl : 60 * 5  // 5 minutes
        },
        sqlStmt: 'SELECT * FROM mobile.' + storeProcedureName + '($1, $2) order by height',
        sqlParams: [distributorId, childDistributorId]
    };

    this.queryDatabase(options, callback);
};

module.exports = Genealogy;

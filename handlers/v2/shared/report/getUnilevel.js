var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var common = require('./common');
var u = require('underscore');

function getResult(rows, count, input) {
    var result = {},
        metaResult = result.meta = {},
        orderResult = result.rows = [];

    rows.forEach(
        function (row) {
            orderResult.push(
                common.getSingResult(row)
            );
        }
    );
    metaResult.count = count;
    metaResult.offset = input.offset || 0;
    metaResult.limit = input.limit || 25;

    return result;
}

function validateRequest(context, callback) {
    var commissionDao = context.commissionDao,
        error,
        input = context.input;

    if (isNaN(input.offset)) {
        input.offset = 0;
    } else {
        input.offset = parseInt(input.offset, 10);
    }

    if (isNaN(input.limit)) {
        input.limit = 25;
    } else {
        input.limit = parseInt(input.limit, 10);
    }

    if (!input.ranks) {
        input.ranks = [];
    } else {
        input.ranks = input.ranks.split(',');
    }

    if (!input.role) {
        input.role = [];
    } else {
        input.role = input.role.split(',');
    }
    
    // if (input.pv === '1') {
    //     input.pv = true;
    // } else {
    //     input.pv = false;
    // }

    commissionDao.isValidMonthlyDate(input.date, callback);
}

function getUnilevel(context, callback) {
    var commissionDao = context.commissionDao,
        reportDao = context.reportDao,
        count,
        input = context.input,
        responseResult = {};
    async.waterfall([
        function (callback) {
            validateRequest(context, callback);
        },
        function (callback) {
            reportDao.getOrganizationUnilevelCount(
                context, 
                function(error, result){
                    if (error) {
                        callback(error);
                        return;
                    }
                    if (!result.rows.length) {
                        count = 0;
                    } else {
                        count = result.rows[0].count;
                    }
                    callback();
            });
        },
        function (callback) {
            var rows;

            reportDao.getOrganizationUnilevel(
                context,
                function (error, result) {
                    if (error) {
                        callback(error);
                        return;
                    }
                    try {
                        rows = getResult(result.rows, count, input);
                    } catch (exception) {
                        callback(exception);
                        return;
                    }
                    callback(null, rows);
                }
            );
        }
    ], function(error, rows){
        var result = {};
        if (error) {
            callback(error);
            return;
        }
        result.body = rows;
        callback(result);
    });
}

module.exports = getUnilevel;
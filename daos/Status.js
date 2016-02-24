/**
 * Status DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function Status(context) {
    DAO.call(this, context);
}

util.inherits(Status, DAO);

var isLoading = false;
var isLoaded = false;
var statusMapById = {};
var statusMapByName = {};
var statusMapByCode = {};
var statusArray = [];
var loadStatusDataCallbacks = [];

function isStatusDataLoaded() {
    return isLoaded;
}

function loadStatusData(callback) {
    if (isLoaded) {
        callback();
        return;
    }

    loadStatusDataCallbacks.push(callback);
    if (isLoading) {
        return;
    }
    isLoading = true;

    var self = this;

    async.waterfall([
        function (next) {
            var options;

            options = {
                sqlStmt: 'SELECT * FROM statuses'
            };
            self.queryDatabase(options, next);
        },

        function (result, next) {
            var statuses = result.rows;
            statuses.forEach(function (status) {
                statusMapById[status.id] = status;
                statusMapByName[status.name] = status;
                statusMapByCode[status.status_code] = status;
                statusArray.push(status);
            });

            isLoaded = true;
            next();
        }
    ], function (error) {
        // Set the `isLoading` flag as `false` whatever we loaded success or fail.
        isLoading = false;

        // If error occurred, `loadStatusData` maybe called more than one time.
        // So we must reset `loadStatusDataCallbacks` here.
        var callbacks = loadStatusDataCallbacks;
        loadStatusDataCallbacks = [];

        callbacks.forEach(function (eachCallback) {
            if (error) {
                eachCallback(error);
            } else {
                eachCallback();
            }
        });
    });
}

function getEntryByKey(entryMap, key, callback) {
    if (isStatusDataLoaded()) {
        callback(null, entryMap[key]);
        return;
    }

    loadStatusData.call(this, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, entryMap[key]);
        return;
    });
}

Status.prototype.getAllStatuses = function (callback) {
    if (isStatusDataLoaded()) {
        callback(null, statusArray);
        return;
    }

    loadStatusData.call(this, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, statusArray);
        return;
    });
};

Status.prototype.getStatusById = function (statusId, callback) {
    getEntryByKey.call(this, statusMapById, statusId, callback);
};

Status.prototype.getStatusByName = function (statusName, callback) {
    getEntryByKey.call(this, statusMapByName, statusName, callback);
};

Status.prototype.getStatusByCode = function (statusCode, callback) {
    getEntryByKey.call(this, statusMapByCode, statusCode, callback);
};

module.exports = Status;

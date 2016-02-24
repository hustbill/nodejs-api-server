/**
 * Role DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function Role(context) {
    DAO.call(this, context);
}

util.inherits(Role, DAO);

var isLoading = false;
var isLoaded = false;
var roleMapById = {};
var roleMapByName = {};
var roleMapByCode = {};
var roleArray = [];
var loadRoleDataCallbacks = [];

function isRoleDataLoaded() {
    return isLoaded;
}

function loadRoleData(callback) {
    if (isLoaded) {
        callback();
        return;
    }

    loadRoleDataCallbacks.push(callback);
    if (isLoading) {
        return;
    }
    isLoading = true;

    var self = this;

    async.waterfall([
        function (next) {
            var options;

            options = {
                sqlStmt: 'SELECT * FROM roles'
            };
            self.queryDatabase(options, next);
        },

        function (result, next) {
            var roles = result.rows;
            roles.forEach(function (role) {
                roleMapById[role.id] = role;
                roleMapByName[role.name] = role;
                roleMapByCode[role.role_code] = role;
                roleArray.push(role);
            });

            isLoaded = true;
            next();
        }
    ], function (error) {
        // Set the `isLoading` flag as `false` whatever we loaded success or fail.
        isLoading = false;

        // If error occurred, `loadRoleData` maybe called more than one time.
        // So we must reset `loadRoleDataCallbacks` here.
        var callbacks = loadRoleDataCallbacks;
        loadRoleDataCallbacks = [];

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
    if (isRoleDataLoaded()) {
        callback(null, entryMap[key]);
        return;
    }

    loadRoleData.call(this, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, entryMap[key]);
        return;
    });
}

Role.prototype.getAllRoles = function (callback) {
    if (isRoleDataLoaded()) {
        callback(null, roleArray);
        return;
    }

    loadRoleData.call(this, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, roleArray);
        return;
    });
};

Role.prototype.getRoleById = function (roleId, callback) {
    getEntryByKey.call(this, roleMapById, roleId, callback);
};

Role.prototype.getRoleByName = function (roleName, callback) {
    getEntryByKey.call(this, roleMapByName, roleName, callback);
};

Role.prototype.getRoleByCode = function (roleCode, callback) {
    getEntryByKey.call(this, roleMapByCode, roleCode, callback);
};

module.exports = Role;

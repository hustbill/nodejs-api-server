/**
 * CommissionType DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function CommissionType(context) {
    DAO.call(this, context);
}

util.inherits(CommissionType, DAO);

var isLoading = false;
var isLoaded = false;
var mapById = {};
var mapByName = {};
var mapByCode = {};
var mapByPeriod = {};
var dataArray = [];
var loadDataCallbacks = [];

function isDataLoaded() {
    return isLoaded;
}

function loadData(callback) {
    if (isLoaded) {
        callback();
        return;
    }

    loadDataCallbacks.push(callback);
    if (isLoading) {
        return;
    }
    isLoading = true;

    var self = this;

    async.waterfall([
        function (next) {
            var options;

            options = {
                sqlStmt: 'SELECT * FROM commission_types ORDER BY id'
            };
            self.queryDatabase(options, next);
        },

        function (result, next) {
            var ranks = result.rows || [];

            ranks.forEach(function (item) {

                if(item.overview_fields){
                    item.overview_fields = JSON.parse(item.overview_fields);
                }
                
                if(item.details_fields){
                    item.details_fields = JSON.parse(item.details_fields);
                }

                if(item.id) {
                    mapById[item.id] = item;
                }
                if(item.name){
                    mapByName[item.name] = item;
                }
                if(item.code){
                    mapByCode[item.code] = item;
                }

                if(item.period){
                    if(!mapByPeriod[item.period]){
                        mapByPeriod[item.period] = [];
                    }

                    mapByPeriod[item.period].push(item);
                }

                dataArray.push(item);
            });

            isLoaded = true;
            next();
        }
    ], function (error) {
    
        isLoading = false;

        var callbacks = loadDataCallbacks;
        loadDataCallbacks = [];

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
    if (isDataLoaded()) {
        callback(null, entryMap[key]);
        return;
    }

    loadData.call(this, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, entryMap[key]);
        return;
    });
}

CommissionType.prototype.getAllTypes = function (callback) {
    if (isDataLoaded()) {
        callback(null, dataArray);
        return;
    }

    loadData.call(this, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, dataArray);
        return;
    });
};

CommissionType.prototype.getTypeById = function (typeId, callback) {
    getEntryByKey.call(this, mapById, typeId, callback);
};

CommissionType.prototype.getTypeByName = function (typeName, callback) {
    getEntryByKey.call(this, mapByName, typeName, callback);
};

CommissionType.prototype.getTypeByCode = function (typeCode, callback) {
    getEntryByKey.call(this, mapByCode, typeCode, callback);
};

CommissionType.prototype.getTypesByPeriod = function (period, callback) {
    getEntryByKey.call(this, mapByPeriod, period, callback);
};



module.exports = CommissionType;

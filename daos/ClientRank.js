/**
 * ClientRank DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function ClientRank(context) {
    DAO.call(this, context);
}

util.inherits(ClientRank, DAO);

var isLoading = false;
var isLoaded = false;
var rankMapById = {};
var rankMapByName = {};
var rankMapByCode = {};
var rankArray = [];
var loadRankDataCallbacks = [];

function isRankDataLoaded() {
    return isLoaded;
}

function loadRankData(callback) {
    if (isLoaded) {
        callback();
        return;
    }

    loadRankDataCallbacks.push(callback);
    if (isLoading) {
        return;
    }
    isLoading = true;

    var self = this;

    async.waterfall([
        function (next) {
            var options;

            options = {
                sqlStmt: 'SELECT rank_identity AS id, rank_code, name FROM client_ranks'
            };
            self.queryDatabase(options, next);
        },

        function (result, next) {
            var ranks = result.rows;
            ranks.forEach(function (rank) {
                rankMapById[rank.id] = rank;
                rankMapByName[rank.name] = rank;
                rankMapByCode[rank.rank_code] = rank;
                rankArray.push(rank);
            });

            isLoaded = true;
            next();
        }
    ], function (error) {
    
        isLoading = false;

        var callbacks = loadRankDataCallbacks;
        loadRankDataCallbacks = [];

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
    if (isRankDataLoaded()) {
        callback(null, entryMap[key]);
        return;
    }

    //array
    if (typeof key === "object" && key.length) {

        loadRankData.call(this, function (error) {
            var result = [];
            if (error) {
                callback(error);
                return;
            }

            key.forEach(function(item){
                result.push(entryMap[item]);
            });
            callback(null, result);
            return;
        });
    };

    //key
    loadRankData.call(this, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, entryMap[key]);
        return;
    });
}

ClientRank.prototype.getAllRanks = function (callback) {
    if (isRankDataLoaded()) {
        callback(null, rankArray);
        return;
    }

    loadRankData.call(this, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, rankArray);
        return;
    });
};

ClientRank.prototype.getAllRanksGreaterThanRankIdentity = function (company_rank_identity, callback) {
    options = {
        sqlStmt: 'SELECT rank_identity as id, rank_code, name from client_ranks where rank_identity >= ' + company_rank_identity + ' order by rank_identity;'
    };
    this.queryDatabase(options, callback);
};

ClientRank.prototype.getRankById = function (rankId, callback) {
    getEntryByKey.call(this, rankMapById, rankId, callback);
};

ClientRank.prototype.getRankByName = function (rankName, callback) {
    getEntryByKey.call(this, rankMapByName, rankName, callback);
};

ClientRank.prototype.getRankByCode = function (rankCode, callback) {
    getEntryByKey.call(this, rankMapByCode, rankCode, callback);
};

ClientRank.prototype.getClientRankByRankIdentity = function (rankIdentity, callback) {
    var context = this.context;
    context.readModels.ClientRank.find({
        where : {rank_identity : rankIdentity}
    }).done(callback);
};

module.exports = ClientRank;

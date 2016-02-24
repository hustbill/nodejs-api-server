/**
 * Preference DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var LazyLoader = require('../lib/lazyLoader');

var preferencesLoader = null;
var preferencesMapByOwner = null;


function Preference(context) {
    DAO.call(this, context);
}

util.inherits(Preference, DAO);


function loadPreferences(context, callback) {
    if (!preferencesLoader) {
        preferencesLoader = new LazyLoader();
    }

    preferencesLoader.load(
        function (callback) {
            context.readModels.Preference.findAll().success(function (preferenceEntities) {
                callback(null, preferenceEntities);
            }).error(callback);
        },

        function (error, preferences) {
            if (error) {
                callback(error);
                return;
            }

            if (!preferencesMapByOwner) {
                preferencesMapByOwner = {};
                preferences.forEach(function (eachPreference) {
                    var key = eachPreference.owner_type + '-' + eachPreference.owner_id,
                        preferencesOfOwner = preferencesMapByOwner[key];

                    if (!preferencesOfOwner) {
                        preferencesOfOwner = preferencesMapByOwner[key] = {};
                    }

                    preferencesOfOwner[eachPreference.name] = eachPreference.value;
                });
            }

            callback(null, preferences);
        }
    );
}


Preference.prototype.getPreferencesOfOwner = function (ownerType, ownerId, callback) {
    var context = this.context,
        logger = context.logger;

    logger.trace("Getting preferences of %s %d", ownerType, ownerId);
    async.waterfall([
        function (callback) {
            context.readModels.Preference.findAll({
                where : {
                    owner_type : ownerType,
                    owner_id : ownerId,
                    deleted_at : null
                }
            }).done(callback);
        },

        function (preferences, callback) {
            if (!preferences.length) {
                callback(null, null);
                return;
            }

            var preferencesOfOwner = {};
            preferences.forEach(function (eachPreference) {
                preferencesOfOwner[eachPreference.name] = eachPreference.value;
            });
            callback(null, preferencesOfOwner);
        }
    ], callback);
};


Preference.prototype.getPreferenceValue = function (ownerType, ownerId, name, callback) {
    var context = this.context,
        logger = context.logger;

    logger.debug("Getting preference value. owner_type: %s, owner_id: %d, name: %s", ownerType, ownerId, name);

    async.waterfall([
        function (callback) {
            context.readModels.Preference.find({
                where : {owner_type : ownerType, owner_id : ownerId, name : name}
            }).done(callback);
        },

        function (preference, callback) {
            if (!preference) {
                callback(null, null);
                return;
            }

            callback(null, preference.value);
        }
    ], callback);
};


Preference.prototype.setPreferenceValue = function (ownerType, ownerId, name, value, callback) {
    var context = this.context,
        logger = context.logger,
        queryDatabaseOptions;

    logger.debug("Setting preference value. owner_type: %s, owner_id: %d, name: %s, value: %s", ownerType, ownerId, name, value);

    async.waterfall([
        function (callback) {
            context.models.Preference.find({
                where : {owner_type : ownerType, owner_id : ownerId, name : name}
            }).done(callback);
        },

        function (preference, callback) {
            if (preference) {
                preference.value = value;
                preference.save(['value']).done(function (error) {
                    callback(error);
                });
                return;
            }

            context.models.Preference.create({
                owner_type : ownerType,
                owner_id : ownerId,
                name : name,
                value : value
            }).done(function (error) {
                callback(error);
            });
        }
    ], callback);
};


Preference.prototype.getPreferencesOfGroupAndOwner = function (groupType, groupId, ownerType, ownerId, callback) {
    var context = this.context,
        logger = context.logger;

    logger.trace("Getting preferences of %s %d, %s %d", groupType, groupId, ownerType, ownerId);
    async.waterfall([
        function (callback) {
            context.readModels.Preference.findAll({
                where : {
                    group_type : groupType,
                    group_id : groupId,
                    owner_type : ownerType,
                    owner_id : ownerId,
                    deleted_at : null
                }
            }).done(callback);
        },

        function (preferences, callback) {
            if (!preferences.length) {
                callback(null, null);
                return;
            }

            var preferencesOfOwner = {};
            preferences.forEach(function (eachPreference) {
                preferencesOfOwner[eachPreference.name] = eachPreference.value;
            });
            callback(null, preferencesOfOwner);
        }
    ], callback);
};


module.exports = Preference;

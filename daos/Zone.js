/**
 * Zone DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function Zone(context) {
    DAO.call(this, context);
}

util.inherits(Zone, DAO);


/**
 * Get zone ids by country id and state id
 * @param address {Object} Address entity.
 * @param callback {Function} Callback function.
 */
Zone.prototype.getZoneIdsByCountryIdAndStateId = function (countryId, stateId, callback) {
    var options = {
            cache : {
                key : 'ZoneIds_' + countryId + '_' + stateId,
                ttl : 60 * 60 * 2  // 2 hours
            },
            sqlStmt: 'SELECT * FROM get_zone_ids($1, $2)',
            sqlParams: [countryId, stateId]
        };

    this.queryDatabase(options, function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        var zoneIds = result.rows.map(function (row) {
            return row.get_zone_ids;
        });

        callback(null, zoneIds);
    });
};

module.exports = Zone;

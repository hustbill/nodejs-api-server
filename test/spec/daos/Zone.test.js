/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var util = require('util');

var sutPath = '../../../daos/Zone.js';
var ZoneDao = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : true,
        database : true
    }, callback);
}


describe('daos/Zone', function () {
    describe('getZoneIdsByCountryIdAndStateId()', function () {
        it('should callback zone ids of given country id and state id', function (done) {
            var countryId = 1214,   // USA
                stateId = 10048,    // New York
                zoneIdsExpected = [10048, 29, 2];
            async.waterfall([
                getContext,

                function (context, callback) {
                    var zoneDao = new ZoneDao(context);
                    zoneDao.getZoneIdsByCountryIdAndStateId(countryId, stateId, callback);
                },

                function (zoneIds, callback) {
                    expect(zoneIds).to.be.ok;
                    expect(zoneIds.sort()).to.eql(zoneIdsExpected.sort());

                    callback();
                }
            ], done);
        });
    });
});


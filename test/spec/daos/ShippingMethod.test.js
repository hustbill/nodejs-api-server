/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var util = require('util');

var sutPath = '../../../daos/ShippingMethod.js';
var ShippingMethodDao = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true
    }, callback);
}


function getShippingMethodsOfZone(context, zoneId, callback) {
    context.readModels.ShippingMethod.findAll({
        where: "(zone_id IS NULL or zone_id = " + zoneId + ") AND (display_on IS NULL OR display_on != 'none')"
    }).success(function (shippingMethods) {
        callback(null, shippingMethods);
    }).error(callback);
}


describe('daos/ShippingMethod', function () {
    describe('getShippingMethodById()', function () {
        it.only('should work', function (done) {
            var context,
                shippingMethodId = 1,
                shippingMethodExpected = {
                    id : 1,
                    zone_id : 1,
                    name : 'Canada Ground',
                    shippingAddressChangeable : true
                };

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var shippingMethodDao = new ShippingMethodDao(context);
                    shippingMethodDao.getShippingMethodById(shippingMethodId, callback);
                },

                function (shippingMethod, callback) {
                    console.log(shippingMethod);
                    expect(shippingMethod).to.be.ok;

                    Object.keys(shippingMethodExpected).forEach(function (key) {
                        expect(shippingMethod[key]).to.eql(shippingMethodExpected[key]);
                    });

                    expect(shippingMethod.shippingAddresses).to.be.not.ok;

                    callback();
                }
            ], done);            
        });
    });


    describe('getShippingMethodsInZones()', function () {
        it('should callback shipping methods available for given zone ids', function (done) {
            var context,
                zoneIds = [1, 5, 15],
                allShippingMethods,
                shippingMethodsPartials = [];

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var shippingMethodDao = new ShippingMethodDao(context);
                    shippingMethodDao.getShippingMethodsInZones(zoneIds, callback);
                },

                function (result, callback) {
                    allShippingMethods = result;

                    async.forEachSeries(zoneIds, function (eachZoneId, callback) {
                        getShippingMethodsOfZone(context, eachZoneId, function (error, shippingMethods) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            shippingMethodsPartials = shippingMethodsPartials.concat(shippingMethods);
                            callback();
                        });
                    }, callback);
                },

                function (callback) {
                    expect(allShippingMethods).to.be.ok;
                    expect(allShippingMethods.length).to.be.equal(shippingMethodsPartials.length);
                    expect(allShippingMethods.map(function (item) {
                        return item.id;
                    }).sort()).to.be.eql(shippingMethodsPartials.map(function (item) {
                        return item.id;
                    }).sort());

                    callback();
                }
            ], done);
        });

        it('pick up shipping methods should have shippingAddresses field', function (done) {
            var context,
                zoneIds = [3],
                allShippingMethods,
                shippingMethodsPartials = [];

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var shippingMethodDao = new ShippingMethodDao(context);
                    shippingMethodDao.getShippingMethodsInZones(zoneIds, callback);
                },

                function (result, callback) {
                    allShippingMethods = result;

                    expect(allShippingMethods).to.be.ok;

                    allShippingMethods.forEach(function (shippingMethod) {
                        if (!shippingMethod.shippingAddressChangeable) {
                            expect(shippingMethod.shippingAddresses).to.be.instanceof(Array);
                        }
                    });

                    callback();
                }
            ], done);
        });
    });
});


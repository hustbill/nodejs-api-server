/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var u = require('underscore');
var testUtil = require('../../testUtil');
var util = require('util');
var UserDao = require('../../../daos/User');

var sutPath = '../../../daos/Address.js';
var AddressDao = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : true,
        database : true,
        user : true
    }, callback);
}


describe('daos/Address', function () {
    describe('getAddressById()', function () {
        it('should work', function (done) {
            var addressId = 1001,
                context,
                address,
                country,
                state;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var addressDao = new AddressDao(context);
                    addressDao.getAddressById(addressId, callback);
                },

                function (result, callback) {
                    address = result;

                    expect(address).to.be.ok;
                    expect(address.id).to.equal(addressId);

                    context.readModels.Country.find(address.country_id).success(function (country) {
                        callback(null, country);
                    }).error(callback);
                },

                function (country, callback) {
                    expect(country).to.be.ok;
                    expect(country.name).to.equal(address.country_name);

                    context.readModels.State.find(address.state_id).success(function (state) {
                        callback(null, state);
                    }).error(callback);
                },

                function (state, callback) {
                    expect(state).to.be.ok;
                    expect(state.name).to.equal(address.state_name);

                    callback();
                }
            ], done);
        });
    });


    describe('getCountryOfAddress()', function () {
        it('should work', function (done) {
            var address = {
                    country_id : 1214
                },
                countryExpect = {
                    id : 1214,
                    name : 'United States',
                    iso : 'US',
                    iso3 : 'USA',
                    currency_id : 149,
                    continent_id : 6
                };

            async.waterfall([
                getContext,

                function (context, callback) {
                    var addressDao = new AddressDao(context);
                    addressDao.getCountryOfAddress(address, callback);
                },

                function (country, callback) {
                    expect(country).to.be.ok;

                    Object.keys(countryExpect).forEach(function (key) {
                        expect(country[key]).to.equal(countryExpect[key]);
                    });
                    expect(address.country).to.equal(country);

                    callback();
                }
            ], done);
        });
    });


    describe('getStateOfAddress()', function () {
        it('should work', function (done) {
            var address = {
                    state_id : 10001
                },
                stateExpect = {
                    id : 10001,
                    name : 'Alberta',
                    abbr : 'AB',
                    country_id : 1035
                };

            async.waterfall([
                getContext,

                function (context, callback) {
                    var addressDao = new AddressDao(context);
                    addressDao.getStateOfAddress(address, callback);
                },

                function (state, callback) {
                    expect(state).to.be.ok;
                    expect(state).to.eql(stateExpect);
                    expect(address.state).to.equal(state);

                    callback();
                }
            ], done);
        });
    });

    describe('validateHomeAddress()', function () {
        it("don't checkout state and zip for address in country 'AG'", function (done) {
            var address = {
                    country_id : 1008,
                    state_id : 0,
                    city : 'foo',
                    address1 : 'bar',
                    firstname : 'a',
                    lastname : 'b'
                };

            async.waterfall([
                getContext,

                function (context, callback) {
                    var addressDao = new AddressDao(context);
                    addressDao.validateHomeAddress(address, callback);
                },

                function (failures, callback) {
                    expect(failures.length).to.equal(0);

                    callback();
                }
            ], done);

        });
    });
});


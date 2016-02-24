/**
 * Country DAO class.
 */
'use strict';
var util = require('util');
var async = require('async');
var u = require('underscore');
var DAO = require('./DAO.js');
var daos = require('./index');

function Country(context) {
    DAO.call(this, context);
}

util.inherits(Country, DAO);

module.exports = Country;


function getCountryAndStateByOptions(options, callback){
    var context = this.context;
    var logger = context.logger;
    var Country = this.readModels.Country;
    var State = this.readModels.State;
    var Currency = this.readModels.Currency;

    var countryId = options.countryId;
    var countryISO = options.countryISO;
    var currencyId = options.currencyId;
    var continentId = options.continentId;


    logger.debug('Loading countries and states...');
    async.waterfall([
        function (next) {
            var whereCond = {'is_clientactive': true};

            if(countryId){
                whereCond.id =  countryId;
            }

            if(countryISO){
                whereCond.iso =  countryISO;
            }

            if(currencyId){
                whereCond.currency_id =  currencyId;
            }

            if(continentId){
                whereCond.continent_id =  continentId;
            }

            logger.debug('where: %j', whereCond);

            Country.findAll({
                attributes: ['id', 'name', 'iso', 'iso3', 'currency_id', 'continent_id'],
                where: whereCond,
                order: 'name ASC'
            }).success(function (countryEntities) {
                next(null, countryEntities);
            }).error(next);
        },

        function (countryEntities, next) {
            if(!u.isArray(countryEntities)){
                countryEntities = [];
            }
            var country_ids = u.pluck(countryEntities, 'id');
            if(country_ids.length === 0){
                callback(null, countryEntities, []);
                return;
            }
            State.findAll({
                attributes: ['id', 'name', 'abbr', 'country_id'],
                where: {country_id: country_ids}
            }).success(function (stateEntities) {
                next(null, countryEntities, stateEntities);
            }).error(next);
        },
        function (countryEntities, stateEntities, next) {
            if(!u.isArray(stateEntities)){
                stateEntities = [];
            }

            var currency_ids = u.pluck(countryEntities, 'currency_id');
            currency_ids = u.uniq(currency_ids);
            if(currency_ids.length === 0){
                callback(null, countryEntities, stateEntities, []);
                return;
            }

            Currency.findAll({
                attributes: ['id', 'name', 'iso_code', 'num_decimals', 'symbol'],
                where: {id: currency_ids}
            }).success(function (currencyEntities) {
                next(null, countryEntities, stateEntities, currencyEntities);
            }).error(next);
        },
        function (countryEntities, stateEntities, currencyEntities, next) {
            if(!u.isArray(currencyEntities)){
                currencyEntities = [];
            }

            var countryArray = [];
            var countryMapById = {};
            countryEntities.forEach(function (entity) {
                var country = {
                    id : entity.id,
                    name : entity.name,
                    iso : entity.iso,
                    iso3 : entity.iso3,
                    currency_id : entity.currency_id,
                    continent_id : entity.continent_id,
                    currency: {},
                    states : []
                };
                countryArray.push(country);
                countryMapById[entity.id] = country;
            });

            stateEntities.forEach(function (entity) {
                var state = {
                        id : entity.id,
                        name : entity.name,
                        abbr : entity.abbr,
                        country_id : entity.country_id
                    },
                    country = countryMapById[state.country_id];

                if (country) {
                    country.states.push(state);
                }
            });

            currencyEntities.forEach(function (entity) {
                var currency = {
                        id : entity.id,
                        iso_code : entity.iso_code,
                        num_decimals : entity.num_decimals,
                        symbol : entity.symbol
                    },
                    country = countryMapById[currency.country_id];

                if (country) {
                    country.currency = currency;
                }
            });

            next(null, countryArray);
        }
    ], callback);
}

Country.prototype.getAllCountriesAndStates = function (callback) {
    
    getCountryAndStateByOptions.call(this, {}, function (error, countryArray) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, countryArray);
    });
    
};

Country.prototype.getCanShipCountriesByCountryId = function (countryId, callback) {
    var self = this;
    var countryshipDao = daos.createDao('Countryship', this.context);

    async.waterfall([
        function (callback) {
            countryshipDao.getCountryIdsCanShipTo(countryId, callback);
        },

        function (countryIds, callback) {
            if(!u.isArray(countryIds) || countryIds.length === 0 ){
                callback(null, []);
                return;
            }

            getCountryAndStateByOptions.call(self, {countryId: countryIds}, function (error, countryArray) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, countryArray);
            });
        }
    ], callback);
};

Country.prototype.getCanShipCountriesByUserId = function (userId, callback) {
    var self = this;
    var userDao = daos.createDao('User', this.context);

    async.waterfall([
        function (callback) {
            userDao.getById(userId, callback);
        },

        function (user, callback) {
            if (!user) {
                callback(new Error('User not found, id: ' + userId));
                return;
            }

            userDao.getHomeAddressOfUser(user, callback);
        },

        function (homeAddress, callback) {
            if (!homeAddress) {
                callback(new Error('Home address not set.'));
                return;
            }

            self.getCanShipCountriesByCountryId(homeAddress.country_id, callback);
        }
    ], callback);
};

Country.prototype.getCountryById = function (countryId, callback) {
    getCountryAndStateByOptions.call(this, {countryId: countryId}, function (error, countryArray) {
        if (error) {
            callback(error);
            return;
        }
        if(u.isArray(countryArray) && countryArray.length > 0){
            callback(null, countryArray[0]);
            return;
        }
        callback(null, null);
        
    });
};

Country.prototype.getCountryByIso = function (countryIso, callback) {
    getCountryAndStateByOptions.call(this, {countryISO: countryIso}, function (error, countryArray) {
        if (error) {
            callback(error);
            return;
        }
        if(u.isArray(countryArray) && countryArray.length > 0){
            callback(null, countryArray[0]);
            return;
        }
        callback(null, null);
        
    });
};

Country.prototype.getStateById = function (stateId, callback) {
    var State = this.readModels.State;
    State.find(stateId).success(function(state){
        callback(null, state);
    }).error(callback);
};


Country.prototype.getEuropeCountryISOes = function (callback) {

    getCountryAndStateByOptions.call(this, {currencyId: 49, continentId: 5}, function (error, countryArray) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, u.pluck(countryArray, 'iso'));
    });
};


Country.prototype.getFreeTaxISOes = function (callback) {
    var self = this;
    async.waterfall([
        function (callback) {
            self.getEuropeCountryISOes(callback);
        },

        function (europeCountryISOes, callback) {
            var result = u.without(europeCountryISOes, "NL", "RU", "KZ", "UA")
                .push("MX");

            callback(null, result);
        }
    ], callback);
};

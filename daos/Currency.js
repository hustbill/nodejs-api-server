/**
 * Currency DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var LazyLoader = require('../lib/lazyLoader');

var currenciesLoader = null;
var currenciesMapById = null;


function Currency(context) {
    DAO.call(this, context);
}

util.inherits(Currency, DAO);


/**
 * load all currency records
 */
function loadCurrencies(context, callback) {
    if (!currenciesLoader) {
        currenciesLoader = new LazyLoader();
    }

    currenciesLoader.load(
        function (callback) {
            context.readModels.Currency.findAll().success(function (currencies) {
                callback(null, currencies);
            }).error(callback);
        },

        function (error, currencies) {
            if (error) {
                callback(error);
                return;
            }

            if (!currenciesMapById) {
                currenciesMapById = {};
                currencies.forEach(function (eachCurrency) {
                    currenciesMapById[eachCurrency.id] = eachCurrency;
                });
            }

            callback(null, currencies);
        }
    );
}


/**
 * get currency by id
 */
Currency.prototype.getCurrencyById = function (currencyId, callback) {
    loadCurrencies(this.context, function (error) {
        if (error) {
            callback(error);
            return;
        }

        var currency = currenciesMapById[currencyId];
        if (!currency) {
            callback(null, null);
            return;
        }

        callback(null, currency);
    });
};


module.exports = Currency;

/**
 * ClientFXRate DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var LazyLoader = require('../lib/lazyLoader');

var clientFXRatesLoader = null;
var clientFXRatesMapByCurrencyId = null;


function ClientFXRate(context) {
    DAO.call(this, context);
}

util.inherits(ClientFXRate, DAO);


/**
 * load all client fx rate records
 */
function loadClientFXRates(context, callback) {
    if (!clientFXRatesLoader) {
        clientFXRatesLoader = new LazyLoader();
    }

    clientFXRatesLoader.load(
        function (callback) {
            context.readModels.ClientFXRate.findAll().success(function (clientFXRates) {
                callback(null, clientFXRates);
            }).error(callback);
        },

        function (error, clientFXRates) {
            if (error) {
                callback(error);
                return;
            }

            if (!clientFXRatesMapByCurrencyId) {
                clientFXRatesMapByCurrencyId = {};
                clientFXRates.forEach(function (eachClientFXRate) {
                    clientFXRatesMapByCurrencyId[eachClientFXRate.currency_id] = eachClientFXRate;
                });
            }

            callback(null, clientFXRates);
        }
    );
}


/**
 * get fx rate based on USD
 */
ClientFXRate.prototype.getConvertRateOfCurrency = function (currencyId, callback) {
    loadClientFXRates(this.context, function (error) {
        if (error) {
            callback(error);
            return;
        }

        var clientFXRate = clientFXRatesMapByCurrencyId[currencyId];
        if (!clientFXRate) {
            callback(null, 1.0);
            return;
        }

        callback(null, clientFXRate.convert_rate || 1.0);
    });
};


module.exports = ClientFXRate;

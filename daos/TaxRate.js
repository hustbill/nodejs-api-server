/**
 * TaxRate DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function TaxRate(context) {
    DAO.call(this, context);
}

util.inherits(TaxRate, DAO);


TaxRate.prototype.getTaxRatesInZones = function (zoneIds, callback) {
    if (!zoneIds) {
        zoneIds = [];
    }

    var logger = this.logger;

    logger.debug('Getting tax rates in zones %s', zoneIds);
    this.readModels.TaxRate.findAll({
        where: {zone_id : zoneIds}
    }).success(function (taxRates) {
        logger.debug('%d tax rates founded.', taxRates.length);
        callback(null, taxRates);
    }).error(callback);
};


TaxRate.prototype.getTaxRateByZoneIdAndTaxCategoryId = function (zoneId, taxCategoryId, callback) {
    this.readModels.TaxRate.find({
        where : {
            zone_id : zoneId,
            tax_category_id : taxCategoryId
        }
    }).done(callback);
};

module.exports = TaxRate;

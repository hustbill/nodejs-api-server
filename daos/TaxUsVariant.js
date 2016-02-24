/**
 * TaxUsVariant DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function TaxUsVariant(context) {
    DAO.call(this, context);
}

util.inherits(TaxUsVariant, DAO);


TaxUsVariant.prototype.getTaxRate = function (variantId, stateId, callback) {
    this.readModels.TaxUsVariant.find({
        where: {
            variant_id : variantId,
            state_id : stateId
        }
    }).success(function (taxUsVariant) {
        if (!taxUsVariant) {
            callback(null, 0);
            return;
        }
        callback(null, taxUsVariant.rate_state);
    }).error(callback);
};

module.exports = TaxUsVariant;

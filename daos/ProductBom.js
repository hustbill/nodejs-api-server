/**
 * ProductBom DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function ProductBom(context) {
    DAO.call(this, context);
}

util.inherits(ProductBom, DAO);


ProductBom.prototype.getProductBomsByVariantId = function (variantId, callback) {
    this.readModels.ProductBom.findAll({
        where: {variant_id : variantId}
    }).success(function (productBoms) {
        callback(null, productBoms);
    }).error(callback);
};

module.exports = ProductBom;

/**
 * Catalog DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function Catalog(context) {
    DAO.call(this, context);
}

util.inherits(Catalog, DAO);


Catalog.prototype.getCatalogByCode = function (code, callback) {
    this.readModels.Catalog.find({
        where: {code : code}
    }).done(callback);
};

Catalog.prototype.getCatalogProduct = function (roleId, catalogId, productId, callback) {
    this.readModels.CatalogProduct.find({
        where : {
            role_id : roleId,
            catalog_id : catalogId,
            product_id : productId,
            deleted_at : null
        }
    }).done(callback);
};

module.exports = Catalog;

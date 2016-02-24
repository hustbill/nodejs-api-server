/**
 * ProductThumbnail DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function ProductThumbnail(context) {
    DAO.call(this, context);
}

util.inherits(ProductThumbnail, DAO);

module.exports = ProductThumbnail;

ProductThumbnail.prototype.getByProductIds = function (productIds, callback) {
    this.readModels.ProductThumbnail.findAll({
        where : {
            product_id : productIds
        }
    }).done(callback);
};
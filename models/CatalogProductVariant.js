/**
 * catalog_product_variants table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('catalog_product_variant', {
        catalog_product_id:  DataTypes.INTEGER,
        variant_id:  DataTypes.INTEGER,
        price:  DataTypes.FLOAT,
        suggested_price:  DataTypes.FLOAT,
        deleted_at:  DataTypes.DATE
    });
};

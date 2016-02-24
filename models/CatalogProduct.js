/**
 * catalog_products table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('catalog_product', {
        role_id:  DataTypes.INTEGER,
        catalog_id:  DataTypes.INTEGER,
        product_id:  DataTypes.INTEGER
    });
};

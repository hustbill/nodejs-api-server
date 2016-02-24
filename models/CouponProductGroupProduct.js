/**
 * coupon_product_groups_products table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('coupon_product_groups_product', {
        product_id : DataTypes.STRING,
        catalog_id : DataTypes.STRING,
        coupon_product_group_id : DataTypes.STRING
    });
};

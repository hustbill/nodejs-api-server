/**
 * coupon_product_groups table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('coupon_product_group', {
        name : DataTypes.STRING,
        description : DataTypes.STRING
    });
};

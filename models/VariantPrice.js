/**
 * variant_prices table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('variant_price', {
        variant_id:  DataTypes.INTEGER,
        role_id:  DataTypes.INTEGER,
        order_price_type_id:  DataTypes.INTEGER,
        amount:  DataTypes.FLOAT
    });
};

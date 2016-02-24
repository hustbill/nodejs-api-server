/**
 * variants table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('variant', {
        product_id:  DataTypes.INTEGER,
        sku:  DataTypes.STRING,
        weight:  DataTypes.FLOAT,
        height:  DataTypes.FLOAT,
        width:  DataTypes.FLOAT,
        depth:  DataTypes.FLOAT,
        deleted_at:  DataTypes.DATE,
        is_master:  DataTypes.BOOLEAN,
        count_on_hand:  DataTypes.INTEGER,
        available_on:  DataTypes.DATE,
        position:  DataTypes.INTEGER,
        packtype_id:  DataTypes.INTEGER,
        cost_price:  DataTypes.FLOAT
    });
};

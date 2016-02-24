/**
 * shipping_methods table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('shipping_method', {
        zone_id:  DataTypes.INTEGER,
        name:  DataTypes.STRING,
        display_on:  DataTypes.STRING,
        is_default: DataTypes.BOOLEAN
    });
};

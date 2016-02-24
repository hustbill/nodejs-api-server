/**
 * pickup_locations table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('pickup_location', {
        shipping_method_id:  DataTypes.INTEGER,
        address_id:  DataTypes.INTEGER,
        name:  DataTypes.STRING,
        active:  DataTypes.BOOLEAN
    });
};

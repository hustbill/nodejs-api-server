/**
 * inventory_units table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('inventory_unit', {
        order_id:  DataTypes.INTEGER,
        variant_id:  DataTypes.INTEGER,
        state:  DataTypes.STRING,
        lock_version:  DataTypes.INTEGER,
        shipment_id:  DataTypes.INTEGER,
        return_authorization_id:  DataTypes.INTEGER
    });
};

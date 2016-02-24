/**
 * shipments table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('shipment', {
        order_id:  DataTypes.INTEGER,
        shipping_method_id:  DataTypes.INTEGER,
        weight:  DataTypes.FLOAT,
        tracking:  DataTypes.STRING,
        number:  DataTypes.STRING,
        cost:  DataTypes.FLOAT,
        shipped_at:  DataTypes.DATE,
        address_id:  DataTypes.INTEGER,
        state:  DataTypes.STRING,
        warehouse_id:  DataTypes.INTEGER
    });
};

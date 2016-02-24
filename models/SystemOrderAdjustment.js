/**
 * system_order_adjustments table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('system_order_adjustment', {
        active:  DataTypes.BOOLEAN,
        amount:  DataTypes.FLOAT,
        description:  DataTypes.STRING,
        name:  DataTypes.STRING
    });
};

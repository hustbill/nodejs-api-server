/**
 * autoship_adjustments table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('autoship_adjustment', {
        active: DataTypes.BOOLEAN,
        autoship_id : DataTypes.INTEGER,
        amount: DataTypes.FLOAT,
        label: DataTypes.STRING
    });
};

/**
 * adjustments table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('adjustment', {
        order_id:  DataTypes.INTEGER,
        amount:  DataTypes.FLOAT,
        label:  DataTypes.STRING,
        source_id:  DataTypes.INTEGER,
        source_type:  DataTypes.STRING,
        mandatory:  DataTypes.STRING,
        locked:  DataTypes.STRING,
        originator_id:  DataTypes.INTEGER,
        originator_type:  DataTypes.STRING
    });
};

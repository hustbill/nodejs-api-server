/**
 * calculators table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('calculator', {
        type:  DataTypes.STRING,
        calculable_id:  DataTypes.INTEGER,
        calculable_type:  DataTypes.STRING,
        deleted_at: DataTypes.DATE
    });
};

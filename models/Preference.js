/**
 * preferences table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('preference', {
        name:  DataTypes.STRING,
        owner_id:  DataTypes.INTEGER,
        owner_type:  DataTypes.STRING,
        group_id:  DataTypes.INTEGER,
        group_type:  DataTypes.STRING,
        value:  DataTypes.TEXT,
        deleted_at: DataTypes.DATE
    });
};

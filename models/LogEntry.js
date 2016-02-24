/**
 * log_entries table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('log_entry', {
        source_id:  DataTypes.INTEGER,
        source_type:  DataTypes.STRING,
        details:  DataTypes.TEXT
    });
};

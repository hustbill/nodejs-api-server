/**
 * autoship_runs table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('autoship_run', {
        autoship_id:  DataTypes.INTEGER,
        request:  DataTypes.STRING,
        details:  DataTypes.STRING,
        state:  DataTypes.STRING
    });
};

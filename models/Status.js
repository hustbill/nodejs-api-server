/**
 * statuses table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('status', {
        status_code:  DataTypes.STRING,
        name:  DataTypes.STRING,
        description:  DataTypes.STRING
    });
};

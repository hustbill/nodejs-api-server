/**
 * states table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('state', {
        name:  DataTypes.STRING,
        abbr:  DataTypes.STRING,
        region:  DataTypes.STRING,
        country_id:  DataTypes.INTEGER,
        active:  DataTypes.BOOLEAN
    });
};

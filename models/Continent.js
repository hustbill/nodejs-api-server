/**
 * continents table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('continent', {
        name:  DataTypes.STRING,
        description:  DataTypes.STRING
    });
};

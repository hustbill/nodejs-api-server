/**
 * personalized_types table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('personalized_type', {
        name:  DataTypes.STRING,
        localization_key:  DataTypes.STRING,
        description:  DataTypes.STRING,
        active:  DataTypes.BOOLEAN
    });
};

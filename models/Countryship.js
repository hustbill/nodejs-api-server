/**
 * countryships table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('countryship', {
        country_id:  DataTypes.INTEGER,
        destination_country_id:  DataTypes.INTEGER
    });
};

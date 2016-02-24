/**
 * countries table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('country', {
        iso_name:  DataTypes.STRING,
        iso:  DataTypes.STRING,
        name:  DataTypes.STRING,
        iso3:  DataTypes.STRING,
        numcode:  DataTypes.INTEGER,
        is_clientactive:  DataTypes.BOOLEAN,
        currency_id:  DataTypes.INTEGER,
        continent_id:  DataTypes.INTEGER,
        commission_currency_id:  DataTypes.INTEGER
    });
};

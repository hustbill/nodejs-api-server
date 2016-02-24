/**
 * currencies table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('currency', {
        iso_code:  DataTypes.STRING,
        iso_number:  DataTypes.STRING,
        num_decimals:  DataTypes.INTEGER,
        name:  DataTypes.STRING,
        is_active:  DataTypes.BOOLEAN,
        symbol:  DataTypes.STRING
    });
};

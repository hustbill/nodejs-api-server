/**
 * client_fxrates table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('client_fxrate', {
        currency_id:  DataTypes.INTEGER,
        convert_rate:  DataTypes.FLOAT
    }, {
        freezeTableName: true,
        tableName : 'client_fxrates'
    });
};

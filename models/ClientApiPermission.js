/**
 * web.client_api_permissions table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('ClientApiPermission', {
        allowed:  DataTypes.BOOLEAN,
        client_id:  DataTypes.STRING,
        api_name:  DataTypes.STRING
    }, {
        freezeTableName: true,
        tableName : 'web.client_api_permissions'
    });
};

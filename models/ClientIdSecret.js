/**
 * mobile.client_ids_secrets table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('ClientIdSecret', {
        active:  DataTypes.BOOLEAN,
        client_id:  DataTypes.STRING,
        client_secret:  DataTypes.STRING,
        remember_token:  DataTypes.STRING,
        description:  DataTypes.STRING,
        is_internal:  DataTypes.BOOLEAN,
        redirect_uri:  DataTypes.STRING
    }, {
        freezeTableName: true,
        tableName : 'mobile.client_ids_secrets'
    });
};

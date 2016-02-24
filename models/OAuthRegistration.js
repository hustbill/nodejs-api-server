/**
 * web.oauth_registrations table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('OAuthRegistration', {
        active:  DataTypes.BOOLEAN,
        client_id:  DataTypes.STRING,
        client_secret:  DataTypes.STRING,
        remember_token:  DataTypes.STRING,
        description:  DataTypes.STRING,
        is_internal:  DataTypes.BOOLEAN,
        redirect_uri:  DataTypes.STRING
    }, {
        freezeTableName: true,
        tableName : 'web.oauth_registrations'
    });
};

/**
 * OauthToken database definition
 */
module.exports = function (sequelize, DataTypes) {
    //FIXME: This is not complete definition, only serve as an example
    return sequelize.define('oauth_token', {
        id : DataTypes.INTEGER,
        hmac_key : DataTypes.STRING
    });
};

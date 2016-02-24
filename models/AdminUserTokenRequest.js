/**
 * admin_user_token_requests table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('admin_user_token_request', {
        admin_user_id: DataTypes.INTEGER,
        hide_from_display: DataTypes.BOOLEAN,
        user_id: DataTypes.INTEGER,
        source_ip: DataTypes.STRING
    });
};
/**
 * users table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('user', {
        email:  DataTypes.STRING,
        encrypted_password:  DataTypes.STRING,
        password_salt:  DataTypes.STRING,
        remember_token:  DataTypes.STRING,
        persistence_token:  DataTypes.STRING,
        reset_password_token:  DataTypes.STRING,
        perishable_token:  DataTypes.STRING,
        sign_in_count:  DataTypes.INTEGER,
        failed_attempts:  DataTypes.INTEGER,
        last_request_at:  DataTypes.DATE,
        current_sign_in_at:  DataTypes.DATE,
        last_sign_in_at:  DataTypes.DATE,
        current_sign_in_ip:  DataTypes.STRING,
        last_sign_in_ip:  DataTypes.STRING,
        login:  DataTypes.STRING,
        authentication_token:  DataTypes.STRING,
        unlock_token:  DataTypes.STRING,
        locked_at:  DataTypes.DATE,
        remember_created_at:  DataTypes.DATE,
        entry_date:  DataTypes.DATE,
        entry_operator:  DataTypes.INTEGER,
        timezone_id:  DataTypes.INTEGER,
        reset_password_sent_at:  DataTypes.DATE,
        password_changed_at:  DataTypes.DATE,
        status_id: DataTypes.INTEGER
    });
};

/**
 * roles table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('role', {
        role_code:  DataTypes.STRING,
        name:  DataTypes.STRING,
        description:  DataTypes.STRING,
        is_admin:  DataTypes.BOOLEAN
    });
};

/**
 * users_ship_addresses table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('users_ship_address', {
        user_id:  DataTypes.INTEGER,
        address_id: DataTypes.BIGINT,
        is_default: DataTypes.BOOLEAN,
        active: DataTypes.BOOLEAN
    });
};
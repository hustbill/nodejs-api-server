/**
 * warehouses table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('warehouse', {
        name:  DataTypes.STRING,
        address_id:  DataTypes.INTEGER,
        zone_id:  DataTypes.INTEGER,
        legal_entity_id:  DataTypes.INTEGER
    });
};

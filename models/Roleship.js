/**
 * roleships table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('roleship', {
        source_role_id:  DataTypes.INTEGER,
        destination_role_id:  DataTypes.INTEGER,
        catalog_id:  DataTypes.INTEGER,
        description:  DataTypes.STRING
    });
};

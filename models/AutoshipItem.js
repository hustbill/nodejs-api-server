/**
 * autoship_items table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('autoship_item', {
        autoship_id:  DataTypes.INTEGER,
        variant_id:  DataTypes.INTEGER,
        quantity:  DataTypes.INTEGER,
        catalog_code:  DataTypes.STRING,
        role_id:  DataTypes.INTEGER
    });
};

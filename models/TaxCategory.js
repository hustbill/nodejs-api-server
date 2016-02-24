/**
 * tax_categories table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('tax_category', {
        name:  DataTypes.STRING,
        description:  DataTypes.STRING,
        is_default:  DataTypes.BOOLEAN
    });
};

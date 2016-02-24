/**
 * tax_rates table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('tax_rate', {
        zone_id:  DataTypes.INTEGER,
        amount:  DataTypes.DECIMAL(10, 8),
        tax_category_id:  DataTypes.INTEGER
    });
};

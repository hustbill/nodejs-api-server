/**
 * tax_us_variants table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('tax_us_variant', {
        variant_id:  DataTypes.INTEGER,
        state_id:  DataTypes.INTEGER,
        rate_state:  DataTypes.DECIMAL(18, 2)
    });
};

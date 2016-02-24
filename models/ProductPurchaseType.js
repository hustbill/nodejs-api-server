/**
 * product_purchase_types table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('product_purchase_type', {
        code:  DataTypes.STRING,
        name:  DataTypes.STRING,
        description:  DataTypes.STRING
    });
};

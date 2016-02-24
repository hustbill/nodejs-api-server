/**
 * shipping_categories table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('shipping_category', {
        name:  DataTypes.STRING
    });
};

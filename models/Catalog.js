/**
 * catalogs table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('catalog', {
        code:  DataTypes.STRING,
        name:  DataTypes.STRING,
        description:  DataTypes.STRING,
        deleted_at:  DataTypes.DATE
    });
};

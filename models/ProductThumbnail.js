/**
 * product_purchase_types table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('ProductThumbnail', {
        product_id:  DataTypes.STRING,
        asset_id:  DataTypes.STRING
    }, {tableName:'product_thumbnails'});
};


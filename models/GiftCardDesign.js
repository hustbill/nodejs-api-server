/**
 * gift_card_designs table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('gift_card_design', {
        small_image_asset_id:  DataTypes.INTEGER,
        large_image_asset_id:  DataTypes.INTEGER
    });
};

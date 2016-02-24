/**
 * assets table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('asset', {
        viewable_id : DataTypes.INTEGER,
        viewable_type : DataTypes.STRING,
        attachment_content_type : DataTypes.STRING,
        attachment_file_name : DataTypes.STRING,
        attachment_size : DataTypes.INTEGER,
        position : DataTypes.INTEGER,
        type : DataTypes.STRING,
        attachment_updated_at : DataTypes.DATE,
        attachment_width : DataTypes.INTEGER,
        attachment_height : DataTypes.INTEGER,
        alt:  DataTypes.TEXT
    });
};

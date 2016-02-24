/**
 * taxons table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('taxon', {
        taxonomy_id:  DataTypes.INTEGER,
        parent_id:  DataTypes.INTEGER,
        position:  DataTypes.INTEGER,
        name:  DataTypes.STRING,
        permalink:  DataTypes.STRING,
        lft:  DataTypes.INTEGER,
        rgt:  DataTypes.INTEGER,
        icon_file_name:  DataTypes.STRING,
        icon_content_type:  DataTypes.STRING,
        icon_file_size:  DataTypes.INTEGER,
        icon_updated_at:  DataTypes.DATE,
        description:  DataTypes.TEXT
    });
};

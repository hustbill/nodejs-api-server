/**
 * products table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('product', {
        name:  DataTypes.STRING,
        description:  DataTypes.TEXT,
        permalink:  DataTypes.STRING,
        tax_category_id:  DataTypes.INTEGER,
        shipping_category_id:  DataTypes.INTEGER,
        deleted_at:  DataTypes.DATE,
        meta_description:  DataTypes.STRING,
        meta_keywords:  DataTypes.STRING,
        position:  DataTypes.INTEGER,
        is_featured: DataTypes.BOOLEAN,
        can_discount: DataTypes.BOOLEAN,
        distributor_only_membership: DataTypes.BOOLEAN
    });
};

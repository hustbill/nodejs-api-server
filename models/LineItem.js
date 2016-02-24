/**
 * line_items table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('line_item', {
        order_id:  DataTypes.INTEGER,
        variant_id:  DataTypes.INTEGER,
        quantity:  DataTypes.INTEGER,
        price:  DataTypes.FLOAT,
        line_no:  DataTypes.INTEGER,
        dt_volume:  DataTypes.FLOAT,
        u_volume:  DataTypes.FLOAT,
        ft_volume:  DataTypes.FLOAT,
        q_volume:  DataTypes.FLOAT,
        r_volume:  DataTypes.FLOAT,
        autoship_quantity:  DataTypes.INTEGER,
        is_autoship:  DataTypes.BOOLEAN,
        retail_price:  DataTypes.FLOAT,
        tax_amount:  DataTypes.FLOAT,
        catalog_product_variant_id:  DataTypes.INTEGER,
        catalog_code:  DataTypes.STRING,
        role_id:  DataTypes.INTEGER,
        adj_cv:  DataTypes.FLOAT,
        adj_qv:  DataTypes.FLOAT
    });
};

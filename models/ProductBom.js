/**
 * product_boms table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('product_bom', {
        isactive:  DataTypes.BOOLEAN,
        createdby:  DataTypes.STRING,
        updatedby:  DataTypes.STRING,
        line:  DataTypes.FLOAT,
        variant_id:  DataTypes.INTEGER,
        variantbom_id:  DataTypes.INTEGER,
        bomqty:  DataTypes.FLOAT,
        description:  DataTypes.STRING,
        bomtype:  DataTypes.STRING,
        shippingfeeapplicable:  DataTypes.BOOLEAN
    });
};

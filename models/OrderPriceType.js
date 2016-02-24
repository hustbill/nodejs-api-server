/**
 * order_price_types table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('order_price_type', {
        code:  DataTypes.STRING,
        name:  DataTypes.STRING,
        description:  DataTypes.STRING,
        source_id:  DataTypes.INTEGER,
        source_type:  DataTypes.STRING,
        start_at:  DataTypes.DATE,
        end_at:  DataTypes.DATE
    });
};

/**
 * payment_methods table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('payment_method', {
        type:  DataTypes.STRING,
        name:  DataTypes.STRING,
        description:  DataTypes.TEXT,
        active:  DataTypes.BOOLEAN,
        environment:  DataTypes.STRING,
        deleted_at:  DataTypes.DATE,
        display_on:  DataTypes.STRING,
        zone_id:  DataTypes.INTEGER,
        percentage:  DataTypes.INTEGER,
        is_creditcard:  DataTypes.BOOLEAN,
        active_for:  DataTypes.STRING
    });
};

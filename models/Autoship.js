/**
 * autoships table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('autoship', {
        user_id:  DataTypes.INTEGER,
        order_number:  DataTypes.STRING,
        active_date:  DataTypes.INTEGER,
        state:  DataTypes.STRING,
        bill_address_id:  DataTypes.INTEGER,
        ship_address_id:  DataTypes.INTEGER,
        shipping_method_id:  DataTypes.INTEGER,
        shipment_state:  DataTypes.STRING,
        payment_state:  DataTypes.STRING,
        email:  DataTypes.STRING,
        special_instructions:  DataTypes.TEXT,
        start_date:  DataTypes.DATE,
        created_by:  DataTypes.INTEGER,
        updated_by:  DataTypes.INTEGER,
        role_id:  DataTypes.INTEGER,
        frequency_by_month: DataTypes.INTEGER,
        next_autoship_date: DataTypes.DATE
    });
};

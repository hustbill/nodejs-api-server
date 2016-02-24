/**
 * orders table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('order', {
        user_id:  DataTypes.INTEGER,
        number:  DataTypes.STRING,
        order_date:  DataTypes.DATE,
        item_total:  DataTypes.FLOAT,
        total:  DataTypes.FLOAT,
        state:  DataTypes.STRING,
        adjustment_total:  DataTypes.FLOAT,
        credit_total:  DataTypes.FLOAT,
        completed_at:  DataTypes.DATE,
        bill_address_id:  DataTypes.INTEGER,
        ship_address_id:  DataTypes.INTEGER,
        payment_total:  DataTypes.FLOAT,
        shipping_method_id:  DataTypes.INTEGER,
        shipment_state:  DataTypes.STRING,
        payment_state:  DataTypes.STRING,
        email:  DataTypes.STRING,
        special_instructions:  DataTypes.TEXT,
        distributor:  DataTypes.BOOLEAN,
        autoship:  DataTypes.BOOLEAN,
        balance:  DataTypes.FLOAT,
        entry_operator:  DataTypes.INTEGER,
        order_entry_date:  DataTypes.DATE,
        currency_id:  DataTypes.INTEGER,
        order_type_id:  DataTypes.INTEGER,
        autoship_id:  DataTypes.INTEGER,
        avatax_commit:  DataTypes.BOOLEAN,
        avatax_get:  DataTypes.BOOLEAN,
        avatax_post:  DataTypes.BOOLEAN,
        role_id:  DataTypes.INTEGER,
        source_client_id:  DataTypes.INTEGER,
        client_request_id: DataTypes.STRING
    });
};

/**
 * payments table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('payment', {
        order_id:  DataTypes.INTEGER,
        amount:  DataTypes.FLOAT,
        source_id:  DataTypes.INTEGER,
        source_type:  DataTypes.STRING,
        payment_method_id:  DataTypes.INTEGER,
        state:  DataTypes.STRING,
        response_code:  DataTypes.STRING,
        avs_response:  DataTypes.STRING,
        autoship_payment_id:  DataTypes.INTEGER,
        bill_address_id:  DataTypes.INTEGER
    });
};

/**
 * autoship_payments table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('autoship_payment', {
        autoship_id:  DataTypes.INTEGER,
        payment_number:  DataTypes.STRING,
        user_id:  DataTypes.INTEGER,
        payment_date:  DataTypes.DATE,
        payment_type:  DataTypes.INTEGER,
        payment_amount:  DataTypes.FLOAT,
        creditcard_id:  DataTypes.INTEGER,
        created_by:  DataTypes.INTEGER,
        updated_by:  DataTypes.INTEGER,
        active:  DataTypes.BOOLEAN
    });
};

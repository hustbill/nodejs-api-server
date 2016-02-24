/**
 * gift_card_payments table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('gift_card_payment', {
        gift_card_id:  DataTypes.INTEGER,
        order_id:  DataTypes.STRING,
        amount:  DataTypes.FLOAT
    });
};

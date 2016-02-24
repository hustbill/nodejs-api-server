/**
 * chargeback_creditcards table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('chargeback_creditcard', {
        order_id:  DataTypes.INTEGER,
        hash_signature:  DataTypes.STRING,
        active:  DataTypes.BOOLEAN
    });
};

/**
 * creditcards_tokens table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('creditcards_token', {
        creditcard_id:  {type: DataTypes.INTEGER, primaryKey: true},
        token_id:  DataTypes.STRING,
        payment_method_id:  {type: DataTypes.INTEGER, primaryKey: true}
    });
};

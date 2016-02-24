/**
 * creditcards table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('creditcard', {
        month:  DataTypes.STRING,
        year:  DataTypes.STRING,
        cc_type:  DataTypes.STRING,
        last_digits:  DataTypes.STRING,
        first_name:  DataTypes.STRING,
        last_name:  DataTypes.STRING,
        start_month:  DataTypes.STRING,
        start_year:  DataTypes.STRING,
        issue_number:  DataTypes.STRING,
        address_id:  DataTypes.INTEGER,
        active:  DataTypes.BOOLEAN,
        user_id:  DataTypes.INTEGER,
        hash_signature:  DataTypes.STRING
    });
};

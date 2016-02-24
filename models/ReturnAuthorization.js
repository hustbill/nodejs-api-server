/**
 * return_authorizations table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('return_authorization', {
        order_id:  DataTypes.INTEGER,
        number:  DataTypes.STRING,
        amount:  DataTypes.FLOAT,
        reason:  DataTypes.STRING,
        state:  DataTypes.STRING,
        enter_by:  DataTypes.INTEGER,
        enter_at:  DataTypes.DATE,
        avatax_doccode:  DataTypes.STRING
    });
};

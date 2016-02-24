/**
 * fraud_prevention_events table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('fraud_prevention_event', {
        order_id:  DataTypes.INTEGER,
        order_start_date:  DataTypes.DATE,
        payment_id:  DataTypes.INTEGER,
        reason:  DataTypes.STRING,
        details:  DataTypes.STRING
    });
};

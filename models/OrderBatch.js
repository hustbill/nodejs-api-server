/**
 * order_batches table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('order_batch', {
        client_id:  DataTypes.STRING,
        request_ip:  DataTypes.STRING,
        start_date:  DataTypes.DATE,
        end_date:  DataTypes.DATE,
        active:  DataTypes.BOOLEAN
    });
};

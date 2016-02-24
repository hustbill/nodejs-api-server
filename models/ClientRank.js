/**
 * client_ranks table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('client_rank', {
        rank_identity:  DataTypes.INTEGER,
        rank_code:  DataTypes.STRING,
        name:  DataTypes.STRING,
        description:  DataTypes.STRING,
        discount_rate: DataTypes.FLOAT
    });
};

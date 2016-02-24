module.exports = function (sequelize, DataTypes) {
    return sequelize.define('ForcedMatrix', {
        distributor_id:  DataTypes.INTEGER,
        level:  DataTypes.INTEGER,
        position:  DataTypes.INTEGER
    }, {
        tableName:'medicus_distributor_level_position',
        timestamps: false
    });
};
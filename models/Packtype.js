/**
 * packtypes table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('packtype', {
        name:  DataTypes.STRING
    });
};

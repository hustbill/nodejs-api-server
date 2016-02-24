/**
 * security_questions table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('security_question', {
        question:  DataTypes.TEXT,
        is_default:  DataTypes.BOOLEAN
    });
};

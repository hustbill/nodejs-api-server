/**
 * security_questions_answers table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('security_questions_answer', {
        security_question_id:  {type: DataTypes.INTEGER, primaryKey: true},
        answer:  DataTypes.TEXT,
        user_id:  {type: DataTypes.INTEGER, primaryKey: true}
    });
};

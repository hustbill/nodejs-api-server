/**
 * SecurityQuestion DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function SecurityQuestion(context) {
    DAO.call(this, context);
}

util.inherits(SecurityQuestion, DAO);


SecurityQuestion.prototype.createSecurityQuestion = function (securityQuestion, callback) {
    this.models.SecurityQuestion.create(securityQuestion).done(callback);
};

SecurityQuestion.prototype.getSecurityQuestionById = function (id, callback) {
    this.readModels.SecurityQuestion.find(id).done(callback);
};

function containsAnswer(answers, savedAnswer) {
    var eachAnswer,
        i;

    for (i = 0; i < answers.length; i += 1) {
        eachAnswer = answers[i];
        if (eachAnswer.id === savedAnswer.security_question_id && eachAnswer.answer === savedAnswer.answer) {
            return true;
        }
    }
    return false;
}

SecurityQuestion.prototype.validateAnswers = function (userId, questionAnswers, callback) {
    var self = this,
        context = this.context,
        logger = context.logger;

    logger.trace("Validating security questions answers...");
    console.log(questionAnswers);
    async.waterfall([
        function (callback) {
            // get saved questions and answers.
            var options = {
                    sqlStmt : "SELECT * FROM security_questions_answers WHERE user_id = $1;",
                    sqlParams : [userId]
                };
            self.queryDatabase(options, callback);
        },

        function (result, callback) {
            var savedAnswers = result.rows;

            async.forEachSeries(savedAnswers, function (eachSavedAnswer, next) {
                console.log(eachSavedAnswer);
                if (!containsAnswer(questionAnswers, eachSavedAnswer)) {
                    callback(null, false);
                    return;
                }
                next();

            }, function (error) {
                callback(error, true);
            });
        }
    ], callback);
};

module.exports = SecurityQuestion;

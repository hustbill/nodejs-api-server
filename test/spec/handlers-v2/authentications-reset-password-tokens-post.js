/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/authentication/resetPasswordToken/post.js';
var handler = require(sutPath);

var UserDao = require('../../../daos/User');


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        user : true
    }, callback);
}

describe('/v2/authentications/reset-password-tokens', function () {
    describe('POST', function () {
        before(function () {
            mockery.enable();
            mockery.warnOnReplace(false);
            mockery.warnOnUnregistered(false);
        });

        after(function () {
            mockery.deregisterAll();
            mockery.disable();
        });

        it('should create reset password token if answers is correct', function (done) {
            var context,
                tick = (new Date()).getTime(),
                user = {
                    sponsor : '1007401',
                    login : 'test-' + tick,
                    password : 'password',
                    email : 'test-' + tick + '@test.com',
                    securityQuestions : [
                        {
                            question : 'foo1',
                            answer : 'bar1'
                        },
                        {
                            question : 'foo2',
                            answer : 'bar2'
                        }
                    ]
                },
                newUser;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var userDao = new UserDao(context);
                    userDao.createUser(user, callback);
                },

                function (result, callback) {
                    newUser = result;

                    console.log('getting security questions answers of new user');
                    var sqlStmt = "SELECT * FROM security_questions_answers WHERE user_id=$1;",
                        sqlParams = [newUser.id];
                    context.databaseClient.query(sqlStmt, sqlParams, function (error, result) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        var securityQuestions = result.rows.map(function (row) {
                            return {
                                id : row.security_question_id,
                                answer : row.answer
                            };
                        });
                        callback(null, securityQuestions);
                    });
                },

                function (securityQuestions, callback) {
                    var request = {
                            context : context,
                            body : {
                                email : user.email,
                                'security-questions' : securityQuestions
                            }
                        };

                    handler(request, null, function (result) {
                        console.log(result);
                        expect(result).to.not.be.instanceof(Error);
                        expect(result.body).to.be.ok;

                        context.models.User.find(newUser.id).done(function (error, savedUser) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            expect(savedUser.reset_password_token).to.equal(result.body.token);
                            callback();
                        });
                    });
                }

            ], done);
        });
    });
});

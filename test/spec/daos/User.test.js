/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var util = require('util');
var constants = require('../../../lib/constants');

var sutPath = '../../../daos/User.js';
var UserDao = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        extend : {
            user : {userId : testUtil.getTestUserId()}
        }
    }, callback);
}


describe('daos/User', function () {

    describe('getFullNameByHomeAddress', function () {

        it('should return full name', function (done){
            var homeAddress = {firstname: 'li', lastname: 'bo'};
            var fullName = UserDao.getFullNameByHomeAddress(homeAddress);
            expect(fullName).to.equal('li bo');
            done(null);
        });

        it('should return empty full name', function (done){
            var homeAddress = {firstname: null, lastname: null};
            var fullName = UserDao.getFullNameByHomeAddress(homeAddress);
            expect(fullName).to.equal('');
            done(null);
        });

        it('should return empty full name', function (done){
            var homeAddress = null;
            var fullName = UserDao.getFullNameByHomeAddress(homeAddress);
            expect(fullName).to.equal('');
            done(null);
        });

        it('should return empty full name', function (done){
            var homeAddress = {firstname: '', lastname: 'bo'};
            var fullName = UserDao.getFullNameByHomeAddress(homeAddress);
            expect(fullName).to.equal('bo');
            done(null);
        });

    });

    describe('validateProfileAddresses()', function () {
        it('should callback address validation result of current user', function (done) {
            var userDao;

            async.waterfall([
                getContext,

                function (context, callback) {
                    userDao = new UserDao(context);

                    userDao.getById(context.user.userId, callback);
                },

                function (user, callback) {
                    userDao.validateProfileAddressesOfUser(user, callback);
                },

                function (result, callback) {
                    expect(result).to.an.object;

                    callback();
                }
            ], done);
        });
    });


    describe('isDistributorRenewalDue()', function () {
        it('not due if distributor.lifetime_rank is less than Ranks.RTC', function (done) {
            var userDao,
                distributor = {
                    lifetime_rank : constants.getRankNumberByName('Retail Customer') - 1
                },
                user = {
                    distributor : distributor
                };

            async.waterfall([
                getContext,

                function (context, callback) {
                    userDao = new UserDao(context);
                    userDao.isDistributorRenewalDue(user, function (error, isDue) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        expect(isDue).to.equal(false);
                        callback();
                    });
                }

            ], done);
        });


        it('not due if user is neither distributor nor preffered customer', function (done) {
            var userDao,
                distributor = {
                    lifetime_rank : constants.getRankNumberByName('Retail Customer') - 1
                },
                user = {
                    distributor : distributor
                };

            async.waterfall([
                getContext,

                function (context, callback) {
                    userDao = new UserDao(context);

                    userDao.getRolesOfUser = function (user, callback) {
                        callback(null, []);
                    };

                    userDao.isDistributorRenewalDue(user, function (error, isDue) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        expect(isDue).to.equal(false);
                        callback();
                    });
                }

            ], done);
        });


        it('not due if next_renewal_date is later than 5 days after today', function (done) {
            var userDao,
                now = new Date(),
                distributor = {
                    next_renewal_date : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5),
                    lifetime_rank : constants.getRankNumberByName('Retail Customer')
                },
                user = {
                    distributor : distributor
                };

            async.waterfall([
                getContext,

                function (context, callback) {
                    userDao = new UserDao(context);

                    userDao.getRolesOfUser = function (user, callback) {
                        callback(null, [
                            {
                                name : 'Distributor'
                            }
                        ]);
                    };

                    userDao.isDistributorRenewalDue(user, function (error, isDue) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        expect(isDue).to.equal(false);
                        callback();
                    });
                }

            ], done);
        });


        it('due if next_renewal_date is earlier than 5 days after today', function (done) {
            var userDao,
                now = new Date(),
                distributor = {
                    next_renewal_date : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4),
                    lifetime_rank : constants.getRankNumberByName('Retail Customer')
                },
                user = {
                    distributor : distributor
                };

            async.waterfall([
                getContext,

                function (context, callback) {
                    userDao = new UserDao(context);

                    userDao.getRolesOfUser = function (user, callback) {
                        callback(null, [
                            {
                                name : 'Distributor'
                            }
                        ]);
                    };

                    userDao.isDistributorRenewalDue(user, function (error, isDue) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        expect(isDue).to.equal(true);
                        callback();
                    });
                }

            ], done);
        });
    });

    describe.only('createUser', function () {
        it('should save security questions and answers', function (done) {
            var context,
                tick = (new Date()).getTime(),
                user = {
                    sponsor : '1007401',
                    login : 'test-' + tick,
                    password : 'password',
                    email : 'test-' + tick + '@test.com',
                    roleCode : 'D',
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
                };

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;
                    userDao = new UserDao(context);

                    userDao.createUser(user, callback);
                },

                function (newUser, callback) {
                    expect(newUser.id).to.be.ok;

                    var sqlStmt = 'select * from security_questions_answers where user_id=$1',
                        sqlParams = [newUser.id];
                    context.databaseClient.query(sqlStmt, sqlParams, function (error, result) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        callback(null, result.rows);
                    });
                },

                function (questionAnswers, callback) {
                    expect(questionAnswers.length).to.equal(2);
                    async.forEachSeries(questionAnswers, function (questionAnswer, callback) {
                        context.models.SecurityQuestion.find(questionAnswer.security_question_id).done(function (error, securityQuestion) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            if (questionAnswer.answer === 'bar1') {
                                expect(securityQuestion.question).to.equal('foo1');
                            } else if (questionAnswer.answer === 'bar2') {
                                expect(securityQuestion.question).to.equal('foo2');
                            } else {
                                callback(new Error('Question answer was not saved properly.'));
                                return;
                            }

                            callback();
                        });
                    }, function (error) {
                        callback(error);
                    });
                }

            ], done);
        });
    });

    describe('changePasswordByAdmin', function () {
        it('should change encrypted_password of user', function (done) {
            var context,
                tick = (new Date()).getTime(),
                newUserId,
                newUser,
                changedNewUser,
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
                };


            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;
                    userDao = new UserDao(context);

                    userDao.createUser(user, callback);
                },

                function (result, callback) {
                    newUser = result;
                    newUserId = newUser.id;

                    userDao.changePasswordByAdmin(newUserId, 'password', callback);
                },

                function (callback) {
                    userDao.getById(newUserId, function (error, user) {
                        expect(user.encrypted_password).to.equal(newUser.encrypted_password);
                        callback();
                    });
                }
            ], done);
        });
    });

    describe('updateProfile', function () {
        it('should change login and email of user.', function (done) {
            var context,
                tick = (new Date()).getTime(),
                newUserId,
                newUser,
                changedNewUser,
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
                profile;


            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;
                    userDao = new UserDao(context);

                    userDao.createUser(user, callback);
                },

                function (result, callback) {
                    newUser = result;
                    newUserId = newUser.id;

                    profile = {
                        userId : newUserId,
                        login : 'test-' + (tick + 1),
                        email : newUser.email
                    };
                    userDao.updateProfile(profile, callback);
                },

                function (callback) {
                    userDao.getById(newUserId, function (error, user) {
                        expect(user.login).to.equal(profile.login);
                        expect(user.email).to.equal(profile.email);
                        callback();
                    });
                }
            ], done);
        });
    });
});


/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');
var utils = require('../../../lib/utils');

var sutPath = '../../../handlers/v2/authentication/resetPassword/post.js';
var handler = require(sutPath);

var UserDao = require('../../../daos/User');


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        user : true
    }, callback);
}

describe('/v2/authentications/reset-password', function () {
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

        it('should reset password if token is correct', function (done) {
            var context,
                tick = (new Date()).getTime(),
                userDao,
                user = {
                    sponsor : '1007401',
                    login : 'test-' + tick,
                    password : 'password',
                    email : 'test-' + tick + '@test.com'
                },
                newUser;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    userDao = new UserDao(context);
                    userDao.createUser(user, callback);
                },

                function (result, callback) {
                    newUser = result;

                    userDao.createResetPasswordTokenForUser(newUser, callback);
                },

                function (result, callback) {
                    var request = {
                            context : context,
                            body : {
                                token : result.token,
                                password : 'newPassword'
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

                            expect(savedUser.encrypted_password).to.equal(utils.encryptPassword('newPassword', savedUser.password_salt));
                            expect(savedUser.reset_password_token).to.be.null;
                            expect(savedUser.reset_password_sent_at).to.be.null;
                            callback();
                        });
                    });
                }
            ], done);
        });
    });
});

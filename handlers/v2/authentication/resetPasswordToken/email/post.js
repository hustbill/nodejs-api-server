/**
 * create reset password token
 */

var async = require('async');
var util = require('util');
var utils = require('../../../../../lib/utils');
var daos = require('../../../../../daos');
var mailHelper = require('../../../../../lib/mailHelper');
var u = require('underscore');


function parsePostData(data) {
    var postData = {
        email : data.email
    };

    return postData;
}

function validateParameters(context, postData, callback) {
    var logger = context.logger,
        error;

    logger.trace('Validating request parameters...');

    if (!postData.email) {
        error = new Error('Email is required.');
        error.errorCode = 'InvalidEmail';
        error.statusCode = 400;
        callback(error);
        return;
    }

    callback();
}

function createResetPasswordToken(context, options, callback) {
    var logger = context.logger,
        userDao = daos.createDao('User', context),
        user,
        error;

    logger.trace('Creating reset password token...');
    async.waterfall([
        function (callback) {
            logger.trace('Getting user by email...');
            userDao.getUserByEmail(options.email, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                user = result;
                if (!user) {
                    error = new Error("User with email '" + options.email + "' does not exist.");
                    error.errorCode = 'InvalidEmail';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        },
        function (callback) {
            userDao.createResetPasswordTokenForUser(user, callback);
        },
        function(data, callback){
            mailHelper.sendResetPasswordTokenEmail({
                context: context,
                token: data.token,
                email: user.email,
                login: user.login
            }, function(error){
                if(error){
                    callback(error);
                    return;
                }
                callback();
            });
        }
    ], callback);
}

function generateResponse(result) {
    var response = {
        statusCode : 200,
        body : {
            email : result.email
        }
    };

    return response;
}

function post(request, response, next) {
    var context = request.context,
        logger = context.logger,
        body = request.body,
        userDao = daos.createDao('User', context),
        postData = parsePostData(body);

    logger.trace('Start creating reset password token.');
    async.waterfall([
        function (callback) {
            validateParameters(context, postData, callback);
        },

        function (callback) {
            userDao.uniqueEmail(postData, function(error, isEmailUnique){
                if (error) {
                    callback(error);
                    return;
                };
                callback();
            });
        },

        function (callback) {
            createResetPasswordToken(context, postData, callback);
        }
    ], function (error) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(postData));
    });
}

module.exports = post;

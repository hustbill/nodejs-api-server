/**
 * reset password
 */

var async = require('async');
var util = require('util');
var utils = require('../../../../lib/utils');
var daos = require('../../../../daos');
var u = require('underscore');


function parsePostData(data) {
    var postData = {
        token : data.token,
        password : data.password
    };

    return postData;
}

function validateParameters(context, postData, callback) {
    var logger = context.logger,
        error;

    logger.trace('Validating request parameters...');

    if (!postData.token) {
        error = new Error('Token is required.');
        error.errorCode = 'InvalidResetPasswordToken';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!postData.password) {
        error = new Error('Password is required.');
        error.errorCode = 'InvalidPassword';
        error.statusCode = 400;
        callback(error);
        return;
    }

    callback();
}

function resetPassword(context, options, callback) {
    var logger = context.logger,
        userDao = daos.createDao('User', context);

    logger.trace('Reset password...');
    async.waterfall([
        function (callback) {
            userDao.resetPassword(options.token, options.password, callback);
        }
    ], callback);
}

function generateResponse() {
    var response = {
        statusCode : 200,
        body : {
        }
    };

    return response;
}

function post(request, response, next) {
    var context = request.context,
        logger = context.logger,
        body = request.body,
        postData = parsePostData(body);

    logger.trace('Start creating reset password token.');
    async.waterfall([
        function (callback) {
            validateParameters(context, postData, callback);
        },

        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.resetPassword(postData, callback);
        }
    ], function (error) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse());
    });
}

module.exports = post;

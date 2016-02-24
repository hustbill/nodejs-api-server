/**
 * validate reset password token
 */

var async = require('async');
var util = require('util');
var utils = require('../../../../../lib/utils');
var daos = require('../../../../../daos');
var u = require('underscore');


function validateResetPasswordToken(context, token, callback) {
    var userDao = daos.createDao('User', context);
    userDao.validateResetPasswordToken(token, callback);
}

function generateResponse(available) {
    var response = {
        statusCode : 200,
        body : {
            available : available
        }
    };

    return response;
}

function get(request, response, next) {
    var context = request.context,
        logger = context.logger,
        token = request.query.token,
        error;

    logger.trace('Start validate reset password token.');

    if (!token) {
        error = new Error('Reset password token is required.');
        error.errorCode = 'InvalidToken';
        error.statusCode = 400;
        next(error);
        return;
    }
    async.waterfall([
        function (callback) {
            validateResetPasswordToken(context, token, callback);
        }
    ], function (error, available) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(available));
    });
}

module.exports = get;

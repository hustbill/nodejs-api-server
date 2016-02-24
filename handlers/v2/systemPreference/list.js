// GET /v2/system-preferences

var async = require('async');
var u = require('underscore');

function getPreferences(context, callback) {
    var preferences = {},
        minRegistrationOrderItemTotal = context.config.application.minRegistrationOrderItemTotal;

    if (!u.isUndefined(minRegistrationOrderItemTotal)) {
        preferences['min-registration-order-item-total'] = minRegistrationOrderItemTotal;
    }

    callback(null, preferences);
}

function generateResponse(preferences, callback) {
    var result = { statusCode : 200};

    if (!preferences) {
        result.body = {};
    } else {
        result.body = preferences;
    }

    return result;
}

/**
 * List system preferences
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context;

    async.waterfall([
        function (callback) {
            getPreferences(context, callback);
        }
    ], function (error, preferences) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(preferences));
    });
}

module.exports = list;

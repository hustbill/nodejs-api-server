// GET /v2/autoships

var async = require('async');
var daos = require('../../../daos');
var mapper = require('../../../mapper');

/**
 * convert the database result rows into response object.
 *
 * @method generateResponse
 * @autoships {Array} autoship list.
 */
function generateResponse(autoships) {
    var result = {
            statusCode : 200,
            body : mapper.autoships(autoships)
        };

    return result;
}

/**
 * Return autoship order json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context,
        state = request.query.state;

    async.waterfall([
        function (callback) {
            var autoshipDao = daos.createDao('Autoship', context),
                getAutoshipsOptions = {
                    state : state
                };
            autoshipDao.getAutoships(getAutoshipsOptions, callback);
        }
    ], function (error, autoships) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(autoships));
    });
}

module.exports = list;

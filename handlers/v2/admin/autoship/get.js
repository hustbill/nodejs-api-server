// GET /v2/admin/autoships/:autoshipId

var async = require('async');
var daos = require('../../../../daos');
var mapper = require('../../../../mapper');


function generateResponse(autoship) {
    var result = {
            statusCode : 200,
            body : mapper.autoship(autoship)
        };

    return result;
}

/**
 * Get autoship's details.
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        autoshipId = parseInt(request.params.autoshipId, 10),
        error;

    if (!autoshipId) {
        error = new Error('Autoship id is required.');
        error.errorCode = 'InvalidAutoshipId';
        error.statusCode = 400;
        next(error);
        return;
    }

    async.waterfall([
        function (callback) {
            var autoshipDao = daos.createDao('Autoship', context),
                getAutoshipDetailsOptions = {
                    autoshipId : autoshipId
                };
            autoshipDao.getAutoshipDetails(getAutoshipDetailsOptions, callback);
        }
    ], function (error, autoship) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(autoship));
    });
}

module.exports = get;

// DELETE /v2/autoships/:autoshipId

var async = require('async');
var daos = require('../../../daos');
var mapper = require('../../../mapper');


/**
 * Cancel an autoship by id.
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
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
                cancelAutoshipsOptions = {
                    autoshipId : autoshipId
                };
            autoshipDao.cancelAutoship(cancelAutoshipsOptions, callback);
        }
    ], function (error) {
        if (error) {
            next(error);
            return;
        }

        next({statusCode : 200});
    });
}

module.exports = list;

// GET /v2/admin/taxons

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');


function generateResponse(taxons) {
    var result = {
            statusCode : 200,
            body : mapper.taxons(taxons)
        };

    return result;
}


/**
 * Return sponsor info json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        taxonDao = daos.createDao('Taxon', context);

    async.waterfall([
        function (callback) {
            taxonDao.getTaxonTree(callback);
        }
    ], function (error, result) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(result));
    });
}

module.exports = get;

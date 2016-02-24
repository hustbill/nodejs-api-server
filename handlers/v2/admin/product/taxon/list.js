// GET /v2/admin/products/taxons/:taxonId

var async = require('async');
var catalogName = require('../../../../../lib/constants').catalogName;
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var mapper = require('../../../../../mapper');


function generateResponse(result) {
    var response = {
            statusCode : 200,
            body : {
                taxons : mapper.taxons(result.taxons),
                products : mapper.products(result.products)
            }
        };

    return response;
}


/**
 * get products
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        userId = parseInt(request.query['user-id'], 10),
        taxonId = parseInt(request.params.taxonId, 10),
        catalogCode = request.query['catalog-code'] || 'SP',
        roleCode = request.query['role-code'],
        sortBy = request.query.sortby,
        result = {},
        error;

    if (!userId) {
        error = new Error('User id is required.');
        error.errorCode = 'InvalidUserId';
        error.statusCode = 400;
        next(error);
        return;
    }

    async.waterfall([
        function (callback) {
            var taxonDao = daos.createDao('Taxon', context);
            taxonDao.getTaxonDetailById(taxonId, function (error, taxon) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!taxon) {
                    error = new Error("Taxon " + taxonId + " was not found.");
                    error.errorCode = 'InvalidTaxonId';
                    error.statusCode = 404;
                    callback(error);
                    return;
                }

                result.taxons = [taxon];
                callback();
            });
        },

        function (callback) {
            var productDao = daos.createDao('Product', context),
                getProductsOptions = {
                    userId : userId,
                    taxonId : taxonId,
                    roleCode : roleCode,
                    catalogCode : catalogCode,
                    sortBy : sortBy
                };
            productDao.getProductsForUser(getProductsOptions, function (error, products) {
                if (error) {
                    callback(error);
                    return;
                }

                result.products = products;
                callback();
            });
        }
    ], function (error) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(result));
    });
}

module.exports = get;

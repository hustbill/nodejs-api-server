// GET /v2/admin/autoships/products

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
 * Get products
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        userId = parseInt(request.query['user-id'], 10),
        catalogCode = request.query['catalog-code'] || 'AT',
        roleCode = request.query['role-code'],
        result = {},
        error;

    async.waterfall([
        function (callback) {
            var taxonDao = daos.createDao('Taxon', context);
            taxonDao.getTaxonTree(function (error, taxons) {
                if (error) {
                    callback(error);
                    return;
                }

                result.taxons = taxons;
                callback();
            });
        },

        function (callback) {
            var productDao = daos.createDao('Product', context),
                getProductsOptions = {
                    userId : userId,
                    roleCode : roleCode,
                    catalogCode : catalogCode
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

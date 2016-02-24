// GET /v2/products/taxons/:taxonId

var async = require('async');
var catalogName = require('../../../../lib/constants').catalogName;
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');


function generateResponse(result) {
    var response = {
        statusCode: 200,
        body: {
            taxons: mapper.taxons(result.taxons),
            products: mapper.products(result.products)
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
        logger = context.logger,
        countryId = parseInt(request.query['country-id'], 10),
        taxonId = parseInt(request.params.taxonId, 10),
        catalogCode = request.query['catalog-code'] || 'SP',
        roleCode = request.query['role-code'],
        sortBy = request.query.sortby,
        result = {},

        error;

    async.waterfall([

        function(callback) {
            var taxonDao = daos.createDao('Taxon', context);
            taxonDao.getTaxonDetailById(taxonId, function(error, taxon) {
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
                callback(null, taxon);
            });
        },

        function(taxon, callback) {
            var productDao = daos.createDao('Product', context),
                getProductsMethodName,
                getProductsOptions = {
                    roleCode: roleCode,
                    catalogCode: catalogCode,
                    sortBy: sortBy
                };


            if (taxon && taxon.subTaxonIds && taxon.subTaxonIds.length) {
                getProductsOptions.taxonIds = taxon.subTaxonIds;
                getProductsOptions.isFeatured = true;
            } else {
                getProductsOptions.taxonId = taxonId;
            }

            if (context.user) {
                getProductsMethodName = 'getProductsForUser';
                getProductsOptions.userId = context.user.userId;
            } else {
                getProductsMethodName = 'getProductsForRole';
                getProductsOptions.countryId = countryId;
            }

            productDao[getProductsMethodName](getProductsOptions, function(error, products) {
                if (error) {
                    callback(error);
                    return;
                }

                result.products = products;
                callback();
            });
        }
    ], function(error) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(result));
    });
}

module.exports = get;
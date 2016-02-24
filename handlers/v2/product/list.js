// GET /v2/products

var async = require('async');
var catalogName = require('../../../lib/constants').catalogName;
var daos = require('../../../daos');
var utils = require('../../../lib/utils');
var mapper = require('../../../mapper');


function generateResponse(result) {
    var response = {
            statusCode : 200,
            body : {
                taxons : mapper.taxons(result.taxons),
                meta: result.meta,
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
        countryId = parseInt(request.query['country-id'], 10),
        catalogCode = request.query['catalog-code'] || 'SP',
        roleCode = request.query['role-code'],
        sortBy = request.query.sortby,
        query = request.query.q,
        offset = request.query.offset,
        limit = request.query.limit,
        sku = request.query.sku,
        result = {},
        error;

    async.waterfall([
        function(callback){
            if (offset) {
                request.check('offset', 'offset must be int').notEmpty().isInt();
                offset = parseInt(offset, 10);
            } else {
                offset = 0; //default
            }

            if (limit) {
                request.check('limit', 'limit must be int').notEmpty().isInt();
                limit = parseInt(limit, 10);
            } else {
                limit = 25; //default
            }

            result.meta = {offset: offset, limit: limit, count:0};

            if(query){
                request.check('q', 'q is 3 to 50 characters required').notEmpty().len(3, 50);
            }

            var errors = request.validationErrors();
            if (errors && errors.length > 0) {
                error = new Error(errors[0].msg);
                error.statusCode = 400;
                return callback(error);
            }

            callback();

        },
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
                getProductsMethodName,
                getProductsOptions = {
                    roleCode : roleCode,
                    catalogCode : catalogCode,
                    sortBy : sortBy,
                    sku : sku,
                    offset: offset,
                    limit: limit
                };

                if(query){
                    getProductsOptions.query = query;
                }


            if (context.user) {
                getProductsMethodName = 'getProductsForUser';
                getProductsOptions.userId = context.user.userId;
            } else {
                getProductsMethodName = 'getProductsForRole';
                getProductsOptions.countryId = countryId;
            }

            productDao[getProductsMethodName](getProductsOptions, function (error, products, meta) {
                if (error) {
                    callback(error);
                    return;
                }
                result.meta = meta;
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

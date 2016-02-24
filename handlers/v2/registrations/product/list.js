/**
 * GET /v2/registrations/products?country-id=<country-id>&role-code=<role-code>
 */

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');
var mapper = require('../../../../mapper');
var catalogName = require('../../../../lib/constants').catalogName;


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
 *
 * Get products
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context,
        countryId = parseInt(request.query['country-id'], 10),
        roleCode = request.query['role-code'],
        roleId,
        catalogCode = 'RG',
        sortBy = request.query.sortby,
        productDao = daos.createDao('Product', context),
        result = {},
        error;

    if (!countryId) {
        error = new Error("'country-id' is required.");
        error.errorCode = 'InvalidCountryId';
        error.statusCode = 400;
        next(error);
        return;
    }

    if (!roleCode) {
        error = new Error("'role-code' is required.");
        error.errorCode = 'InvalidRoleCode';
        error.statusCode = 400;
        next(error);
        return;
    }

    async.waterfall([
        function (callback) {
            var roleDao = daos.createDao('Role', context);
            roleDao.getRoleByCode(roleCode, function (error, role) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!role) {
                    error = new Error('Invalid role code.');
                    error.errorCode = 'InvalidRoleCode';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                roleId = role.id;
                callback();
            });
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
            var getProductsOptions = {
                    countryId : countryId,
                    roleId : roleId,
                    operatorRoleId : roleId,
                    catalogCode : catalogCode,
                    sortBy : sortBy
                };
            productDao.getProducts(getProductsOptions, function (error, products) {
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

module.exports = list;

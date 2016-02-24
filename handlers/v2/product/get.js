// GET /v2/products/product-id

var daos = require('../../../daos');
var mapper = require('../../../mapper');
var utils = require('../../../lib/utils');
var u = require('underscore');

/**
 *
 * @method generateResponse
 * @param product {Object} product details.
 * @param callback {Function} callback function.
 */
function generateResponse(product) {
    var result = { statusCode : 200};

    result.body = mapper.product(product);

    return result;
}

/**
 * Return product's details
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        productId = request.params.productId,
        catalogCode = request.query['catalog-code'] || 'SP',
        roleCode = request.query['role-code'],
        allowDeleted = !utils.parseBoolean(request.query['reject-deleted']),
        productDao = daos.createDao('Product', context),
        getProductDetailsMethodName,
        getProductDetailsOptions,
        error;

    if (!productId 
        //|| !u.isNumber(productId) || productId <= 0
        ) {
        error = new Error('InvalidProductId.');
        error.errorCode = 'InvalidProductId';
        error.statusCode = 400;
        next(error);
        return;
    }

    getProductDetailsOptions = {
        allowDeletedProduct : allowDeleted,
        productId : productId,
        roleCode : roleCode,
        catalogCode : catalogCode
    };

    if (context.user) {
        getProductDetailsMethodName = 'getProductDetailsForUser';
        getProductDetailsOptions.userId = context.user.userId;
    } else {
        getProductDetailsMethodName = 'getProductDetailsForRole';
    }

    productDao[getProductDetailsMethodName](getProductDetailsOptions, function (error, product) {
        if (error) {
            next(error);
            return;
        }

        if (!product) {
            error = new Error('Product not found.');
            error.errorCode = 'ProductNotFound.';
            error.statusCode = 400;
            next(error);
            return;
        }

        next(generateResponse(product));
    });
}

module.exports = get;

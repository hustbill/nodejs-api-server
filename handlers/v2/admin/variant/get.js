// GET /v2/admin/variant/:variant-id

var daos = require('../../../../daos');
var mapper = require('../../../../mapper');
var utils = require('../../../../lib/utils');

/**
 *
 * @method generateResponse
 * @param product {Object} product details.
 * @param callback {Function} callback function.
 */
function generateResponse(variant) {
    var result = {
        statusCode : 200,
        body : mapper.variant(variant)
    };

    return result;
}

/**
 * Return variant's details
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        error,
        userId = parseInt(request.query['user-id'], 10),
        variantId = parseInt(request.params.variantId, 10),
        catalogCode = request.query['catalog-code'] || 'SP',
        roleCode = request.query['role-code'],
        allowDeleted = !utils.parseBoolean(request.query['reject-deleted']),
        variantDao = daos.createDao('Variant', context),
        getVariantDetailsOptions;

    if (!variantId) {
        error = new Error('Invalid variant Id');
        error.statusCode = 400;
        next(error);
        return;
    }

    getVariantDetailsOptions = {
        userId : userId,
        variantId : variantId,
        roleCode : roleCode,
        catalogCode : catalogCode,
        allowDeletedVariant : allowDeleted
    };

    variantDao.getVariantDetailForUser(getVariantDetailsOptions, function (error, variant) {
        if (error) {
            next(error);
            return;
        }

        if (!variant) {
            error = new Error('Variant not found.');
            error.errorCode = 'VariantNotFound.';
            error.statusCode = 400;
            next(error);
            return;
        }


        next(generateResponse(variant));
    });
}

module.exports = get;

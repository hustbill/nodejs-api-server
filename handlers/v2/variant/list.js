// GET /v2/variant?id=<variantId[]>

var async = require('async');
var daos = require('../../../daos');
var mapper = require('../../../mapper');
var utils = require('../../../lib/utils');


function getQueryVariantIds(request) {
    var strIds = request.query.id,
        arrStrId,
        arrId = [];

    if (!strIds) {
        return [];
    }

    arrStrId = strIds.split(',');
    arrStrId.forEach(function (strId) {
        var id = parseInt(strId, 10);
        if (id) {
            arrId.push(id);
        }
    });

    return arrId;
}


function generateResponse(variants) {
    var result = {
        statusCode : 200,
        body : mapper.variants(variants)
    };

    return result;
}

/**
 * get multiple variant's details
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context,
        variantIds = getQueryVariantIds(request),
        catalogCode = request.query['catalog-code'] || 'SP',
        roleCode = request.query['role-code'],
        allowDeleted = !utils.parseBoolean(request.query['reject-deleted']),
        variantDao = daos.createDao('Variant', context),
        variants = [],
        error;

    if (!variantIds || !variantIds.length) {
        error = new Error('Variant id is required.');
        error.errorCode = 'InvalidVariantId';
        error.statusCode = 400;
        next(error);
        return;
    }

    async.forEachSeries(variantIds, function (variantId, callback) {
        var getVariantDetailsMethodName,
            getVariantDetailsOptions;

        getVariantDetailsOptions = {
            allowDeletedVariant : allowDeleted,
            variantId : variantId,
            roleCode : roleCode,
            catalogCode : catalogCode
        };

        if (context.user) {
            getVariantDetailsMethodName = 'getVariantDetailForUser';
            getVariantDetailsOptions.userId = context.user.userId;
        } else {
            getVariantDetailsMethodName = 'getVariantDetailForRole';
        }

        variantDao[getVariantDetailsMethodName](getVariantDetailsOptions, function (error, variant) {
            if (error) {
                callback(error);
                return;
            }

            if (variant) {
                variants.push(variant);
            }

            callback();
        });

    }, function (error) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(variants));
    });
}

module.exports = list;

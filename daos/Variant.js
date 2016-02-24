/**
 * Variant DAO class.
 */

var util = require('util');
var async = require('async');
var u = require('underscore');
var DAO = require('./DAO.js');
var daos = require('./index');

function Variant(context) {
    DAO.call(this, context);
}

util.inherits(Variant, DAO);


Variant.prototype.getVariantsById = function(variantIds, callback) {
    var context = this.context;

    context.readModels.Variant.findAll({
        where: {
            id: variantIds
        },
        order: "position"
    }).done(callback);
};


Variant.prototype.getVariantsByProductId = function(productId, callback) {
    var context = this.context;

    context.readModels.Variant.findAll({
        where: {
            product_id: productId
        },
        order: "position"
    }).done(callback);
};


Variant.prototype.getVariantsOfProduct = function(product, callback) {
    if (product.variants) {
        callback(null, product.variants);
        return;
    }

    var context = this.context;

    context.readModels.Variant.findAll({
        where: {
            product_id: product.id
        },
        order: "position"
    }).done(function(error, variants) {
        if (error) {
            callback(error);
            return;
        }

        product.variants = variants;
        callback(null, product.variants);
    });
};


Variant.prototype.getVariantsInProductIds = function(productIds, callback) {
    var context = this.context;

    context.readModels.Variant.findAll({
        where: {
            product_id: productIds
        },
        order: "position"
    }).done(callback);
};


Variant.prototype.getVariantPriceForUser = function(variant, user, catalogCode, callback) {
    var context = this.context,
        logger = context.logger,
        catalogDao,
        catalogId;

    logger.debug("Getting variant price for user...");
    async.waterfall([

        function(callback) {
            catalogDao = daos.createDao('Catalog', context);
            catalogDao.getCatalogByCode(catalogCode, function(error, catalog) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!catalog) {
                    error = new Error("Invalid catalog code.");
                    error.errorCode = 'InvalidCatalogCode';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                catalogId = catalog.id;
                callback();
            });
        },

        function(callback) {
            var userDao = daos.createDao('User', context);
            userDao.getRolesOfUser(user, callback);
        },

        function(roles, callback) {
            var catalogDao,
                error;

            if (!roles.length) {
                logger.debug("Can't get price of variant %d for user %d. User doesn't belong to any roles.",
                    variant.id,
                    user.id);
                error = new Error("User doesn't belong to any roles.");
                error.errorCode = 'VariantPriceUnavailable';
                error.statusCode = 500;
                callback(error);
                return;
            }

            catalogDao = daos.createDao('Catalog', context);
            catalogDao.getCatalogProduct(roles[0].id, catalogId, variant.product_id, callback);
        },

        function(catalogProduct, callback) {
            if (!catalogProduct) {
                var error = new Error('No permitted to get price of variant.');
                error.errorCode = 'VariantPriceUnavailable';
                error.statusCode = 403;
                callback(error);
                return;
            }

            context.readModels.CatalogProductVariant.find({
                where: {
                    catalog_product_id: catalogProduct.id,
                    variant_id: variant.id
                }
            }).done(callback);
        },

        function(catalogProductVariant, callback) {
            if (!catalogProductVariant) {
                logger.debug("Can't get price of variant %d for user %d. Price not set.",
                    variant.id,
                    user.id);
                var error = new Error("Price not set.");
                error.errorCode = 'VariantPriceUnavailable';
                error.statusCode = 500;
                callback(error);
                return;
            }

            callback(null, catalogProductVariant.price);
        }
    ], callback);
};

function getPricesOfVariantIds(context, variantIds, catalogId, callback) {
    var sqlStmt = "SELECT cpv.*, r.name as role_name, r.role_code FROM catalog_product_variants cpv INNER JOIN catalog_products cp ON cpv.catalog_product_id = cp.id INNER JOIN roles r ON cp.role_id = r.id WHERE cp.catalog_id = $1 AND cpv.deleted_at IS NULL AND cp.deleted_at IS NULL AND cpv.variant_id IN (" + variantIds.join(',') + ")",
        sqlParams = [catalogId],
        queryDatabaseOptions = {
            sqlStmt: sqlStmt,
            sqlParams: sqlParams
        };

    DAO.queryDatabase(context, queryDatabaseOptions, function(error, result) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, result.rows);
    });
}

function getCommissionsOfVariantIds(context, variantIds, callback) {
    var sqlStmt = "SELECT vc.*, vct.code, vct.name, vct.description, vct.description FROM variant_commissions vc INNER JOIN variant_commission_types vct ON vc.variant_commission_type_id = vct.id WHERE vc.variant_id IN (" + variantIds.join(',') + ")",
        sqlParams = [],
        queryDatabaseOptions = {
            sqlStmt: sqlStmt,
            sqlParams: sqlParams
        };

    DAO.queryDatabase(context, queryDatabaseOptions, function(error, result) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, result.rows);
    });
}

function getOptionsOfVariantIds(context, variantIds, callback) {
    var sqlStmt = "select ovv.variant_id, ot.presentation as type, ov.name, ov.presentation_value, ov.presentation_type from option_values_variants ovv inner join option_values ov on ovv.option_value_id=ov.id inner join option_types ot on ov.option_type_id = ot.id where ovv.variant_id in (" + variantIds.join(',') + ") and ovv.deleted_at is null",
        sqlParams = [],
        queryDatabaseOptions = {
            sqlStmt: sqlStmt,
            sqlParams: sqlParams
        };

    DAO.queryDatabase(context, queryDatabaseOptions, function(error, result) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, result.rows);
    });
}

function getImagesOfVariantIds(context, variantIds, callback) {
    async.waterfall([

        function(callback) {
            var assetDao = daos.createDao('Asset', context);
            assetDao.getVariantAssetsInIds(variantIds, callback);
        },

        function(assets, callback) {
            var images = [];

            assets.forEach(function(asset) {
                images.push({
                    variantId: asset.viewable_id,
                    url: '/upload/image/' + asset.id + '/large_' + asset.attachment_file_name
                });
            });

            callback(null, images);
        }
    ], callback);
}

function getImagesOfProductIds(context, productIds, callback) {
    async.waterfall([

        function(callback) {
            var assetDao = daos.createDao('Asset', context);
            assetDao.getProductAssetsInIds(productIds, callback);
        },

        function(assets, callback) {
            var images = [];

            assets.forEach(function(asset) {
                images.push({
                    productId: asset.viewable_id,
                    url: '/upload/image/' + asset.id + '/large_' + asset.attachment_file_name
                });
            });

            callback(null, images);
        }
    ], callback);
}

function fillDefaultImagesToVariants(context, variants, callback) {
    variants.forEach(function(variant) {
        if (!variant.images) {
            variant.images = ['/images/noimage/product.jpg'];
        }
    });

    callback();
}


function setCanAushipOfVariantsAsFalse(variants) {
    variants.forEach(function (variant) {
        variant.canAutoship = false;
    });
}

function fillCanAutoshipToVariants(context, variants, variantIds, operatorRoleId, roleId, callback) {
    if (!variants || !variants.length) {
        callback();
        return;
    }

    var autoshipCatalogId;

    async.waterfall([
        function (callback) {
            var catalogDao = daos.createDao('Catalog', context);
            catalogDao.getCatalogByCode('AT', callback);
        },

        function (catalog, next) {
            if (!catalog) {
                setCanAushipOfVariantsAsFalse(variants);
                callback();
                return;
            }

            autoshipCatalogId = catalog.id;

            var roleshipDao = daos.createDao('Roleship', context),
                validatePermissionOptions = {
                    sourceRoleId: operatorRoleId,
                    destinationRoleId: roleId,
                    catalogId: autoshipCatalogId
                };
            roleshipDao.validatePermission(validatePermissionOptions, next);
        },

        function (hasPermission, next) {
            if (!hasPermission) {
                setCanAushipOfVariantsAsFalse(variants);
                callback();
                return;
            }

            var sqlStmt = "select cpv.variant_id from catalog_product_variants cpv inner join catalog_products cp on cpv.catalog_product_id = cp.id where cp.catalog_id=$1 and cp.role_id=$2 and cp.deleted_at is null and cpv.variant_id in (" + variantIds.join(',') + ") and cpv.deleted_at is null",
                sqlParams = [autoshipCatalogId, roleId],
                queryDatabaseOptions = {
                    sqlStmt : sqlStmt,
                    sqlParams : sqlParams
                };

            DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                next(null, result.rows);
            });
        },

        function (autoshipCPVs, callback) {
            variants.forEach(function (variant) {
                var cpv = u.find(autoshipCPVs, function (eachCPV) {
                        return eachCPV.variant_id === variant.id;
                    });

                variant.canAutoship = !!cpv;
            });

            callback();
        }
    ], callback);
}

/*
 *  options = {
 *      variantIds : <integer[]> optional,
 *      catalogId : <integer>,
 *      catalogProductIds : <integer[]>,
 *      operatorRoleId : <integer>,
 *      roleId : <integer>,
 *      allowDeletedVariant : <boolean>,
 *      includeImages : <boolean>,
 *      useDefaultImages : <boolean>,
 *      includePrices : <boolean>,
 *      includeCommissions : <boolean>,
 *      includeOptions : <boolean>,
 *      includeCanAutoship : <boolean>
 *      sku : <string>
 *  }
 */
Variant.prototype.queryVariants = function(options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        sqlStmt,
        sqlParams = [],
        queryDatabaseOptions,
        variants,
        variantIds,
        variantsMapById,
        paramNumber = 1;

    if (options.allowDeletedVariant) {
        sqlStmt = "SELECT v.*, cpv.id as catalog_product_variant_id, cpv.catalog_product_id, cpv.price, cpv.suggested_price FROM variants v INNER JOIN catalog_product_variants cpv ON v.id = cpv.variant_id INNER JOIN catalog_products cp ON cp.id = cpv.catalog_product_id WHERE cpv.catalog_product_id in (" + options.catalogProductIds.join(',') + ") AND cp.role_id = $" + paramNumber;
    } else {
        sqlStmt = "SELECT v.*, cpv.id as catalog_product_variant_id, cpv.catalog_product_id, cpv.price, cpv.suggested_price FROM variants v INNER JOIN catalog_product_variants cpv ON v.id = cpv.variant_id INNER JOIN catalog_products cp ON cp.id = cpv.catalog_product_id WHERE v.deleted_at IS NULL AND cpv.deleted_at IS NULL AND cp.deleted_at IS NULL AND cpv.catalog_product_id in (" + options.catalogProductIds.join(',') + ") AND cp.role_id = $" + paramNumber;
    }
    paramNumber += 1;
    sqlParams.push(options.roleId);

    if (options.sku) {
        sqlStmt += " AND upper(v.sku) like $" + paramNumber;
        paramNumber += 1;
        sqlParams.push("%" + options.sku.toUpperCase() + "%");
    }

    if (options.variantIds && options.variantIds.length) {
        sqlStmt += " AND v.id in (" + options.variantIds.join(',') + ")";
    }

    sqlStmt += " ORDER BY v.position";
    queryDatabaseOptions = {
        sqlStmt: sqlStmt,
        sqlParams: sqlParams
    };

    async.waterfall([

        function(next) {
            self.queryDatabase(queryDatabaseOptions, function(error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                variants = result.rows;
                if (!variants.length) {
                    callback(null, []);
                    return;
                }

                variantIds = variants.map(function(variant) {
                    return variant.id;
                });

                variantsMapById = {};
                variants.forEach(function(variant) {
                    variant.catalog_id = options.catalogId;
                    variantsMapById[variant.id] = variant;
                });

                next();
            });
        },

        function(callback) {
            if (!options.includeImages) {
                callback();
                return;
            }

            logger.trace("Getting images of variants...");
            getImagesOfVariantIds(context, variantIds, function(error, images) {
                if (error) {
                    callback(error);
                    return;
                }

                images.forEach(function(image) {
                    var variant = variantsMapById[image.variantId];
                    if (!variant) {
                        return;
                    }

                    if (!variant.images) {
                        variant.images = [];
                    }

                    variant.images.push(image.url);
                });

                callback();
            });
        },

        function(callback) {
            if (!options.includeImages || !options.useDefaultImages) {
                callback();
                return;
            }

            var productIds = [];
            variants.forEach(function(variant) {
                if (!variant.images || !variant.images.length) {
                    productIds.push(variant.product_id);
                }
            });

            if (!productIds.length) {
                callback();
                return;
            }

            getImagesOfProductIds(context, productIds, function(error, images) {
                if (error) {
                    callback(error);
                    return;
                }

                var imageUrlsMapByProductId = {};
                images.forEach(function(image) {
                    if (!imageUrlsMapByProductId[image.productId]) {
                        imageUrlsMapByProductId[image.productId] = [];
                    }

                    imageUrlsMapByProductId[image.productId].push(image.url);
                });

                variants.forEach(function(variant) {
                    if (!variant.images || !variant.images.length) {
                        variant.images = imageUrlsMapByProductId[variant.product_id];
                    }
                });

                callback();
            });
        },

        function(callback) {
            if (!options.includePrices) {
                callback();
                return;
            }

            logger.trace("Getting prices of variants...");
            getPricesOfVariantIds(context, variantIds, options.catalogId, function(error, prices) {
                if (error) {
                    callback(error);
                    return;
                }

                prices.forEach(function(price) {
                    var variant = variantsMapById[price.variant_id];
                    if (!variant) {
                        return;
                    }

                    if (!variant.prices) {
                        variant.prices = [];
                    }

                    variant.prices.push({
                        role_code: price.role_code,
                        role_name: price.role_name,
                        price: price.price,
                        suggested_price: price.suggested_price
                    });
                });

                callback();
            });
        },

        function(callback) {
            if (!options.includeCommissions) {
                callback();
                return;
            }

            logger.trace("Getting commissions of variants...");
            getCommissionsOfVariantIds(context, variantIds, function(error, commissions) {
                if (error) {
                    callback(error);
                    return;
                }

                commissions.forEach(function(commission) {
                    var variant = variantsMapById[commission.variant_id];
                    if (!variant) {
                        return;
                    }

                    if (!variant.commissions) {
                        variant.commissions = [];
                    }

                    variant.commissions.push(commission);
                });

                callback();
            });
        },

        function(callback) {
            if (!options.includeOptions) {
                callback();
                return;
            }

            logger.trace("Getting options of variants...");
            getOptionsOfVariantIds(context, variantIds, function(error, variantOptions) {
                if (error) {
                    callback(error);
                    return;
                }

                variantOptions.forEach(function(variantOption) {
                    var variant = variantsMapById[variantOption.variant_id];
                    if (!variant) {
                        return;
                    }

                    if (!variant.options) {
                        variant.options = [];
                    }

                    if (variantOption.presentation_type === 'IMG') {
                        if (variantOption.presentation_value) {
                            variantOption.presentation_value = '/upload/' + variantOption.presentation_value;
                        }
                    }

                    variant.options.push(variantOption);
                });

                callback();
            });
        },

        function (callback) {
            if (!options.includeCanAutoship) {
                callback();
                return;
            }

            fillCanAutoshipToVariants(context, variants, variantIds, options.operatorRoleId, options.roleId, callback);
        },

        function(callback) {
            callback(null, variants);
        }
    ], callback);
};

/*
 *  options = {
 *      variantIds : <integer[]> ,
 *      includeImages : <boolean>,
 *
 *  }
 */
Variant.prototype.getVariantsWithOptionsByIds = function(options, callback) {

    var context = this.context;
    var logger = context.logger;
    var variants,
        variantIds,
        variantsMapById;

    async.waterfall([

        //get variants by Ids
        function(callback) {
            context.readModels.Variant.findAll({
                where: {
                    id: options.variantIds
                },
                order: "position"
            }).done(callback);
        },

        //map
        function(result, next) {
            variants = result;
            if (!variants.length) {
                callback(null, []);
                return;
            }

            variantIds = variants.map(function(variant) {
                return variant.id;
            });

            variantsMapById = {};
            variants.forEach(function(variant) {
                variantsMapById[variant.id] = variant;
            });

            next();
        },

        //
        function(callback) {
            if (!options.includeImages) {
                callback();
                return;
            }

            logger.trace("Getting images of variants...");
            getImagesOfVariantIds(context, variantIds, function(error, images) {
                if (error) {
                    callback(error);
                    return;
                }

                images.forEach(function(image) {
                    var variant = variantsMapById[image.variantId];
                    if (!variant) {
                        return;
                    }

                    if (!variant.images) {
                        variant.images = [];
                    }

                    variant.images.push(image.url);
                });

                callback();
            });
        },

        function(callback) {
            if (!options.includeImages) {
                callback();
                return;
            }

            var productIds = [];
            variants.forEach(function(variant) {
                if (!variant.images || !variant.images.length) {
                    productIds.push(variant.product_id);
                }
            });

            if (!productIds.length) {
                callback();
                return;
            }

            getImagesOfProductIds(context, productIds, function(error, images) {
                if (error) {
                    callback(error);
                    return;
                }

                var imageUrlsMapByProductId = {};
                images.forEach(function(image) {
                    if (!imageUrlsMapByProductId[image.productId]) {
                        imageUrlsMapByProductId[image.productId] = [];
                    }

                    imageUrlsMapByProductId[image.productId].push(image.url);
                });

                variants.forEach(function(variant) {
                    if (!variant.images || !variant.images.length) {
                        variant.images = imageUrlsMapByProductId[variant.product_id];
                    }
                });

                callback();
            });
        }

    ], function(error, result){
        if(error){
            callback(error);
            return;
        }

        callback(null, variants);
    });
};


/*
 *  options = {
 *      variantId : <integer>,
 *      allowDeletedVariant : <boolean>
 *  }
 */
Variant.prototype.getVariantDetail = function(options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        variant,
        productId,
        product,
        error;

    if (!options.variantId) {
        error = new Error("Variant id is required.");
        error.errorCode = 'InvalidVariantId';
        error.statusCode = 400;
        callback(error);
        return;
    }

    async.waterfall([
        function(callback) {
            logger.trace("Finding variant with id %d from database...", options.variantId);
            context.readModels.Variant.find(options.variantId).done(callback);
        },

        function(result, next) {
            variant = result;
            if (!variant) {
                callback(null, null);
                return;
            }

            productId = variant.product_id;
            next();
        },

        function(callback) {
            var productDao = daos.createDao('Product', context);
            productDao.getById(productId, function(error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                product = result;
                callback();
            });
        },
        function(callback) {
            logger.trace("Getting images of variant...");
            var variantIds = [variant.id];
            getImagesOfVariantIds(context, variantIds, function(error, images) {
                if (error) {
                    callback(error);
                    return;
                }

                images.forEach(function(image) {
                    if (!variant.images) {
                        variant.images = [];
                    }

                    variant.images.push(image.url);
                });

                callback();
            });
        },

        function(callback) {
            var productIds = [];
            if (!variant.images || !variant.images.length) {
                productIds.push(variant.product_id);
            }

            if (!productIds.length) {
                callback();
                return;
            }

            getImagesOfProductIds(context, productIds, function(error, images) {
                if (error) {
                    callback(error);
                    return;
                }

                var imageUrlsMapByProductId = {};
                images.forEach(function(image) {
                    if (!imageUrlsMapByProductId[image.productId]) {
                        imageUrlsMapByProductId[image.productId] = [];
                    }

                    imageUrlsMapByProductId[image.productId].push(image.url);
                });

                variant.images = imageUrlsMapByProductId[variant.product_id];
                callback();
            });
        },

        function(callback) {
            logger.trace("Getting commissions of variant...");
            var variantIds = [variant.id];
            getCommissionsOfVariantIds(context, variantIds, function(error, commissions) {
                if (error) {
                    callback(error);
                    return;
                }

                commissions.forEach(function(commission) {
                    if (!variant.commissions) {
                        variant.commissions = [];
                    }

                    variant.commissions.push(commission);
                });

                callback();
            });
        },

        function(callback) {
            logger.trace("Getting options of variant...");
            var variantIds = [variant.id];
            getOptionsOfVariantIds(context, variantIds, function(error, variantOptions) {
                if (error) {
                    callback(error);
                    return;
                }

                variantOptions.forEach(function(variantOption) {
                    if (!variant.options) {
                        variant.options = [];
                    }

                    if (variantOption.presentation_type === 'IMG') {
                        if (variantOption.presentation_value) {
                            variantOption.presentation_value = '/upload/' + variantOption.presentation_value;
                        }
                    }

                    variant.options.push(variantOption);
                });

                callback();
            });
        },

        function(callback) {
            variant.name = product.name;
            variant.description = product.description;
            variant.shipping_category_id = product.shipping_category_id;
            variant.tax_category_id = product.tax_category_id;
            variant.can_discount = product.can_discount;

            callback(null, variant);
        }
    ], callback);
};

/*
 *  options = {
 *      userId : <Integer>,
 *      variantId : <integer>,
 *      catalogCode : <string>,
 *      roleId : <String> optional
 *      roleCode : <String> optional
 *      user : <Object> // optional
 *      allowDeletedVariant : <boolean>
 *  }
 */
Variant.prototype.getVariantDetailForUser = function(options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        userDao = daos.createDao('User', context),
        catalogDao,
        userId = options.userId,
        productId,
        product,
        error;

    if (!options.variantId) {
        error = new Error("Variant id is required.");
        error.errorCode = 'InvalidVariantId';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!options.catalogCode) {
        error = new Error("Catalog code is required.");
        error.errorCode = 'InvalidCatalogCode';
        error.statusCode = 400;
        callback(error);
        return;
    }

    async.waterfall([

        function(callback) {
            logger.trace("Finding variant with id %d from database...", options.variantId);
            context.readModels.Variant.find(options.variantId).done(callback);
        },

        function(variant, next) {
            if (!variant) {
                callback(null, null);
                return;
            }

            productId = variant.product_id;

            catalogDao = daos.createDao('Catalog', context);
            catalogDao.getCatalogByCode(options.catalogCode, function(error, catalog) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!catalog) {
                    error = new Error("Invalid catalog code.");
                    error.errorCode = 'InvalidCatalogCode';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                options.catalogId = catalog.id;
                next();
            });
        },

        function(callback) {
            var user = options.user || {
                id: userId
            };
            userDao.getRolesOfUser(user, callback);
        },

        function(roles, callback) {
            if (!roles.length) {
                error = new Error("User doesn't belong to any roles.");
                error.errorCode = 'NoPermissionToGetVariantDetail';
                error.statusCode = 403;
                callback(error);
                return;
            }

            options.operatorRoleId = roles[0].id;

            if (options.roleId) {
                callback();
                return;
            }

            if (!options.roleCode) {
                options.roleId = options.operatorRoleId;
                callback();
                return;
            }

            var roleDao = daos.createDao('Role', context);
            roleDao.getRoleByCode(options.roleCode, function(error, role) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!role) {
                    error = new Error("Role with code '" + options.roleCode + "' does not exist.");
                    error.errorCode = 'InvalidRoleCode';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                options.roleId = role.id;
                callback();
            });
        },

        function(callback) {
            // validate permission
            var roleshipDao = daos.createDao('Roleship', context),
                validatePermissionOptions = {
                    sourceRoleId: options.operatorRoleId,
                    destinationRoleId: options.roleId,
                    catalogId: options.catalogId
                };

            roleshipDao.validatePermission(validatePermissionOptions, function(error, hasPermission) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!hasPermission) {
                    error = new Error("You have no permission to get product in catalog " + options.catalogId + " as role " + options.roleId + ".");
                    error.errorCode = "NoPermissionToGetProduct";
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function(callback) {
            var productDao = daos.createDao('Product', context);
            productDao.getById(productId, function(error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                product = result;
                callback();
            });
        },

        function(callback) {
            catalogDao.getCatalogProduct(options.roleId, options.catalogId, product.id, callback);
        },

        function(catalogProduct, callback) {
            var queryVariantsOptions,
                error;

            if (!catalogProduct) {
                error = new Error("No permission to get product details.");
                error.errorCode = 'NoPermissionToGetProduct';
                error.statusCode = 403;
                callback(error);
                return;
            }

            queryVariantsOptions = {
                variantIds: [options.variantId],
                operatorRoleId: options.operatorRoleId,
                roleId: options.roleId,
                catalogId: options.catalogId,
                catalogProductIds: [catalogProduct.id],
                allowDeletedVariant : options.allowDeletedVariant,
                includeImages: true,
                useDefaultImages: true,
                includePrices: true,
                includeCommissions: true,
                includeOptions: true
            };
            self.queryVariants(queryVariantsOptions, function(error, variants) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!variants.length) {
                    logger.error("Can't get price info of variant %d. Please check catalog_product_variants table and make sure that a record with catalog_product_id=%d and variant_id=%d exists.",
                        options.variantId,
                        catalogProduct.id,
                        options.variantId);
                    error = new Error("Can't get price info of variant " + options.variantId + ".");
                    error.statusCode = 500;
                    callback(error);
                    return;
                }

                callback(null, variants[0]);
            });
        },

        function(variant, callback) {
            variant.name = product.name;
            variant.description = product.description;
            variant.shipping_category_id = product.shipping_category_id;
            variant.tax_category_id = product.tax_category_id;
            variant.can_discount = product.can_discount;

            callback(null, variant);
        }
    ], callback);
};


/*
 *  options = {
 *      variantId : <integer>,
 *      catalogCode : <string>,
 *      roleId : <String> optional
 *      roleCode : <String> optional. required if roleId is not provided.
 *      user : <Object> // optional
 *      allowDeletedVariant : <boolean>
 *  }
 */
Variant.prototype.getVariantDetailForRole = function(options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        catalogDao,
        productId,
        product,
        error;

    if (!options.variantId) {
        error = new Error("Variant id is required.");
        error.errorCode = 'InvalidVariantId';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!options.catalogCode) {
        error = new Error("Catalog code is required.");
        error.errorCode = 'InvalidCatalogCode';
        error.statusCode = 400;
        callback(error);
        return;
    }

    async.waterfall([

        function(callback) {
            logger.trace("Finding variant with id %d from database...", options.variantId);
            context.readModels.Variant.find(options.variantId).done(callback);
        },

        function(variant, next) {
            if (!variant) {
                callback(null, null);
                return;
            }

            productId = variant.product_id;

            catalogDao = daos.createDao('Catalog', context);
            catalogDao.getCatalogByCode(options.catalogCode, function(error, catalog) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!catalog) {
                    error = new Error("Invalid catalog code.");
                    error.errorCode = 'InvalidCatalogCode';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                options.catalogId = catalog.id;
                next();
            });
        },

        function(callback) {
            if (options.roleId) {
                callback();
                return;
            }

            var roleDao,
                error;

            if (!options.roleCode) {
                error = new Error("Role code is required.");
                error.errorCode = 'InvalidRoleCode';
                error.statusCode = 400;
                callback(error);
                return;
            }

            roleDao = daos.createDao('Role', context);
            roleDao.getRoleByCode(options.roleCode, function(error, role) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!role) {
                    error = new Error("Role with code '" + options.roleCode + "' does not exist.");
                    error.errorCode = 'InvalidRoleCode';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                options.roleId = role.id;
                callback();
            });
        },

        function(callback) {
            // validate permission
            var roleshipDao = daos.createDao('Roleship', context),
                validatePermissionOptions = {
                    sourceRoleId: options.roleId,
                    destinationRoleId: options.roleId,
                    catalogId: options.catalogId
                };

            roleshipDao.validatePermission(validatePermissionOptions, function(error, hasPermission) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!hasPermission) {
                    error = new Error("You have no permission to get product in catalog " + options.catalogId + " as role " + options.roleId + ".");
                    error.errorCode = "NoPermissionToGetProduct";
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function(callback) {
            var productDao = daos.createDao('Product', context);
            productDao.getById(productId, function(error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                product = result;
                callback();
            });
        },

        function(callback) {
            catalogDao.getCatalogProduct(options.roleId, options.catalogId, product.id, callback);
        },

        function(catalogProduct, callback) {
            var queryVariantsOptions,
                error;

            if (!catalogProduct) {
                error = new Error("No permission to get product details.");
                error.errorCode = 'NoPermissionToGetProduct';
                error.statusCode = 403;
                callback(error);
                return;
            }

            queryVariantsOptions = {
                variantIds: [options.variantId],
                operatorRoleId: options.operatorRoleId,
                roleId: options.roleId,
                catalogId: options.catalogId,
                catalogProductIds: [catalogProduct.id],
                allowDeletedVariant : options.allowDeletedVariant,
                includeImages: true,
                useDefaultImages: true,
                includePrices: true,
                includeCommissions: true,
                includeOptions: true
            };
            self.queryVariants(queryVariantsOptions, function(error, variants) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!variants.length) {
                    logger.error("Can't get price info of variant %d. Please check catalog_product_variants table and make sure that a record with catalog_product_id=%d and variant_id=%d exists.",
                        options.variantId,
                        catalogProduct.id,
                        options.variantId);
                    error = new Error("Can't get price info of variant " + options.variantId + ".");
                    error.statusCode = 500;
                    callback(error);
                    return;
                }

                callback(null, variants[0]);
            });
        },

        function(variant, callback) {
            variant.name = product.name;
            variant.description = product.description;
            variant.shipping_category_id = product.shipping_category_id;
            variant.tax_category_id = product.tax_category_id;

            callback(null, variant);
        }
    ], callback);
};


Variant.prototype.isVariantNoShippingById = function(variantId, callback) {
    var context = this.context,
        error;

    async.waterfall([

        function(callback) {
            context.readModels.Variant.find(variantId).done(callback);
        },

        function(variant, callback) {
            if (!variant) {
                error = new Error('Can not find variant with id: ' + variantId);
                error.errorCode = 'InvalidVariantId'
                error.statusCode = 400;
                callback(error);
                return;
            }

            var productDao = daos.createDao('Product', context);
            productDao.getShippingCategoryByProductId(variant.product_id, callback);
        },

        function(shippingCategory, callback) {
            var isNoShipping = shippingCategory && shippingCategory.name === 'No Shipping';
            callback(null, isNoShipping);
        }
    ], callback);
};


Variant.prototype.isAllVariantsNoShippingByIds = function(variantIds, callback) {
    var self = this;

    async.forEachSeries(variantIds, function(variantId, next) {
        self.isVariantNoShippingById(variantId, function(error, isNoShipping) {
            if (error) {
                callback(error);
                return;
            }

            if (!isNoShipping) {
                callback(null, false);
                return;
            }

            next();
        });
    }, function(error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, true);
    });
};


function isVariantAvailableInCountry(context, variantId, countryId, callback) {
    async.waterfall([
        function (callback) {
            context.readModels.Variant.find(variantId).done(callback);
        },

        function (variant, next) {
            if (!variant) {
                callback(null, false);
                return;
            }

            var productDao = daos.createDao('Product', context);
            productDao.isProductAvailableInCountry(variant.product_id, countryId, next);
        }
    ], callback);
}

Variant.prototype.getVariantsAvailabilitiesInCountry = function (variantIds, countryId, callback) {
    var context = this.context,
        availabilities = [];

    async.forEachSeries(variantIds, function (variantId, callback) {
        isVariantAvailableInCountry(context, variantId, countryId, function (error, isAvailable) {
            if (error) {
                callback(error);
                return;
            }
            availabilities.push({
                'variant-id': variantId,
                available: isAvailable
            });

            callback();
        });
    }, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, availabilities);
    });
};


module.exports = Variant;

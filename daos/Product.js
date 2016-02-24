/**
 * Product DAO class.
 */

var util = require('util');
var async = require('async');
var u = require('underscore');
var DAO = require('./DAO.js');
var daos = require('./index');
var cacheKey = require('../lib/cacheKey');
var cacheHelper = require('../lib/cacheHelper');
var Ranks = require('../lib/constants').Ranks;
var LazyLoader = require('../lib/lazyLoader');

var sidedoor = require('sidedoor');


function Product(context) {
    DAO.call(this, context);
}

util.inherits(Product, DAO);


function getProductByName(context, name, callback) {
    context.readModels.Product.find({
        where : {
            name : name
        }
    }).done(callback);
}

function shouldIncludeBusinessEntryKits(context, user, callback) {
    var userDao = daos.createDao('User', context);

    async.waterfall([
        function (next) {
            userDao.isDistributor(user, function (error, isDistributor) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!isDistributor) {
                    callback(null, false);
                    return;
                }

                next();
            });
        },

        function (callback) {
            userDao.getDistributorOfUser(user, function (error, distributor) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, (distributor.lifetime_rank || 0) < Ranks.REP);
            });
        }
    ], callback);
}

function shouldIncludePreferredCustomerEntryKits(context, user, callback) {
    var userDao = daos.createDao('User', context);

    async.waterfall([
        function (next) {
            userDao.isPreferredCustomer(user, function (error, isPreferredCustomer) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!isPreferredCustomer) {
                    callback(null, false);
                    return;
                }

                next();
            });
        },

        function (callback) {
            userDao.getDistributorOfUser(user, function (error, distributor) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, (distributor.lifetime_rank || 0) < Ranks.WPC);
            });
        }
    ], callback);
}

var proReplicatedWebsiteLoader;
function getVariantIdOfProductNamedProReplicatedWebsite(context, callback) {
    if (!proReplicatedWebsiteLoader) {
        proReplicatedWebsiteLoader = new LazyLoader();
    }

    proReplicatedWebsiteLoader.load(function (callback) {
        var product;

        async.waterfall([
            function (callback) {
                getProductByName(context, 'Pro Replicated Website', callback);
            },

            function (result, callback) {
                product = result;

                if (!product) {
                    callback(null, null);
                    return;
                }

                var variantDao = daos.createDao('Variant', context);
                variantDao.getVariantsOfProduct(product, callback);
            },

            function (variants, callback) {
                if (variants && variants.length) {
                    callback(null, variants[0].id);
                    return;
                }

                var logger = context.logger;
                logger.error("Product %d hasn't any variant.", product.id);
                callback(null, null);
            }
        ], callback);
    }, callback);
}

function shouldIncludeSystemKits(context, user, callback) {
    // distributors who are due should buy system kits
    var userDao = daos.createDao('User', context);
    userDao.isDistributorRenewalDue(user, callback);
}

function shouldIncludeUpgradePacks(context, user, callback) {
    var userDao = daos.createDao('User', context);

    async.waterfall([
        function (next) {
            userDao.isDistributor(user, function (error, isDistributor) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!isDistributor) {
                    callback(null, false);
                    return;
                }

                next();
            });
        },

        function (next) {
            userDao.getDistributorOfUser(user, function (error, distributor) {
                if (error) {
                    callback(error);
                    return;
                }

                if ((distributor.lifetime_rank || 0) < Ranks.RTC) {
                    callback(null, false);
                    return;
                }

                next();
            });
        },

        function (next) {
            if (!user.entry_date) {
                var logger = context.logger;
                logger.error('Error when calling shouldIncludeUpgradePacks, entry_date is invalid, user id: ' + user.id);
                callback(null, false);
                return;
            }

            userDao.getCountryOfUser(user, next);
        },

        function (country, callback) {
            var countryISO = country.iso,
                now = new Date(),
                today = new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                limitDays,
                shouldInclude;

            if (countryISO === 'RU' ||
                    countryISO === 'UA' ||
                    countryISO === 'BY' ||
                    countryISO === 'KZ') {
                limitDays = 120;
            } else {
                limitDays = 60;
            }

            shouldInclude = (today - user.entry_date) < limitDays * 86400000;
            callback(null, shouldInclude);
        }
    ], callback);
}

function getProductsByTaxonName(context, taxonName, callback) {
    async.waterfall([
        function (callback) {
            var taxonDao = daos.createDao('Taxon', context);
            taxonDao.getTaxonByName(taxonName, callback);
        },

        function (taxon, callback) {
            var sqlStmt = "SELECT p.* FROM products p INNER JOIN products_taxons pt ON p.id = pt.product_id WHERE pt.taxon_id = $1 ORDER BY p.position;",
                sqlParams = [taxon.id],
                options = {
                    cache : {
                        key : cacheKey.productsByTaxonId(taxon.id),
                        ttl : 60 * 60 * 24  // 24 hours
                    },
                    sqlStmt : sqlStmt,
                    sqlParams : sqlParams
                },
                productDao = daos.createDao('Product', context);

            productDao.queryDatabase(options, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, result.rows);
            });
        }
    ], callback);
}

function getProductsByCountryIdAndTaxonName(context, countryId, taxonName, callback) {
    var logger = context.logger;

    async.waterfall([
        function (callback) {
            var taxonDao = daos.createDao('Taxon', context);
            taxonDao.getTaxonByName(taxonName, callback);
        },

        function (taxon, next) {
            if (!taxon) {
                logger.warn("Taxon named '%s' was not found.", taxonName);
                callback(null, []);
                return;
            }

            var sqlStmt = "SELECT p.* FROM products p INNER JOIN products_taxons pt ON p.id = pt.product_id INNER JOIN countries_products cp ON p.id = cp.product_id WHERE pt.taxon_id = $1 AND cp.country_id = $2 AND p.deleted_at IS NULL ORDER BY p.position;",
                sqlParams = [taxon.id, countryId],
                options = {
                    cache : {
                        key : cacheKey.productsByCountryIdAndTaxonId(countryId, taxon.id),
                        ttl : 300  // 5 minutes
                    },
                    sqlStmt : sqlStmt,
                    sqlParams : sqlParams
                },
                productDao = daos.createDao('Product', context);

            productDao.queryDatabase(options, function (error, result) {
                if (error) {
                    next(error);
                    return;
                }

                next(null, result.rows);
            });
        }
    ], callback);
}

/**
 * Query products in db
 *
 *  options : {
 *     catalogId : <integer>, // required
 *     countryId : <integer>,
 *     taxonId : <integer>,
 *     taxonIds : <integer[]>, //optional
 *     isFeatured : <boolean>, //optional
 *      query : <string>, //optional , query from name or description
 *     offset: <integer>, //optional
 *     limit: <integer>, //optional
 *     roleId : <integer>,
 *     sortBy: <string>, //optional, name, position, price, name-desc, position-desc, price-desc
 *     sku: <string>, //optional.
 *  }
 *
 * @param context {Object} context object.
 * @param options {Object} query options.
 * @param callback {Function} callback function.
 */
function queryProducts(context, options, callback) {
    var sqlSelect = " SELECT p.*, cap.id as catalog_product_id, pt.taxon_id ",
        sqlSelectCount = " SELECT count(*) AS count ",
        sqlStmt = " FROM products p INNER JOIN products_taxons pt ON p.id = pt.product_id ",
        sqlWhere = '',
        sqlOrder = '',
        sqlOffsetLimit ='',
        sqlParams = [],
        paramNumber = 1,
        whereConditions = [],
        count = 0,
        meta,
        offset = options.offset,
        limit = options.limit,
        DEFAULT_OFFSET = 0,
        DEFAULT_LIMIT = 200,
        queryDatabaseOptions;

    if (offset) {
        offset = parseInt(offset, 10);
        if (offset < 0) {
            offset = DEFAULT_OFFSET;
        }
    } else {
        offset = DEFAULT_OFFSET;
    }

    if (limit) {
        limit = parseInt(limit, 10);
        if (!limit || limit <= 0 || limit > DEFAULT_LIMIT) {
            limit = DEFAULT_LIMIT;
        }
    }

    sqlStmt += " INNER JOIN catalog_products cap ON p.id = cap.product_id";
    sqlStmt += " INNER JOIN catalog_product_variants cpv ON cpv.catalog_product_id = cap.id";
    sqlStmt += " INNER JOIN variants v ON v.id = cpv.variant_id";

    if (options.countryId) {
        sqlStmt += " INNER JOIN countries_products cp ON p.id = cp.product_id";
        whereConditions.push("cp.country_id = $" + paramNumber);
        paramNumber += 1;
        sqlParams.push(options.countryId);
    }

    if (options.sku){
        whereConditions.push("upper(v.sku) like $" + paramNumber);
        paramNumber += 1;
        sqlParams.push("%" + options.sku.toUpperCase() + "%");
    }

    if (options.taxonId) {
        whereConditions.push("pt.taxon_id = $" + paramNumber);
        paramNumber += 1;
        sqlParams.push(options.taxonId);
    } else if (u.isArray(options.taxonIds) && !u.isEmpty(options.taxonIds) ) {
        whereConditions.push(" pt.taxon_id IN (" + options.taxonIds.join(",")+") ");
    }

    if (u.isBoolean(options.isFeatured)) {
        whereConditions.push("p.is_featured = $" + paramNumber);
        paramNumber += 1;
        sqlParams.push(options.isFeatured);
    }

    if(options.query){
        whereConditions.push("(p.name ILIKE $"+paramNumber+" OR p.description ILIKE $"+paramNumber+" )");
        paramNumber += 1;
        sqlParams.push("%"+options.query+"%");
    }

    if (options.roleId || options.catalogId) {

        whereConditions.push("cap.role_id = $" + paramNumber);
        paramNumber += 1;
        sqlParams.push(options.roleId);

        whereConditions.push("cap.catalog_id = $" + paramNumber);
        paramNumber += 1;
        sqlParams.push(options.catalogId);

    }

    //
    whereConditions.push("cap.deleted_at IS NULL");
    whereConditions.push("cpv.deleted_at IS NULL ");
    whereConditions.push("v.deleted_at IS NULL ");
    whereConditions.push("p.deleted_at IS NULL");

    sqlWhere = " WHERE " + whereConditions.join(' AND ');


    queryDatabaseOptions = {
        sqlStmt : sqlSelectCount + sqlStmt + sqlWhere,
        sqlParams : sqlParams
    };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error, countResult) {
        if (error) {
            callback(error);
            return;
        }

        count = countResult.rows[0].count;
        meta = {
            count: count,
            offset: offset,
            limit: limit,
            sortby: options.sortBy
        };

        if(count === 0){
            return callback(null, [], meta);
        }

        if(offset){
            sqlOffsetLimit += " OFFSET $" + paramNumber ;
            paramNumber += 1;
            sqlParams.push(offset);
        }


        if(limit){
            sqlOffsetLimit += " LIMIT $" + paramNumber ;
            paramNumber += 1;
            sqlParams.push(limit);
        }



        sqlOrder = " ORDER BY ";

        switch(options.sortBy) {
            case 'position':
                sqlOrder += 'p.position';
                break;
            case 'position-desc':
                sortProperty += 'p.position DESC';
                break;
            case 'name':
                sqlOrder += 'p.name';
                break;
            case 'name-desc':
                sqlOrder += 'p.name DESC';
                break;
            case 'price':
                sqlOrder += 'cpv.price';
                break;
            case 'price-desc':
                sqlOrder += 'cpv.price DESC';
                break;
            default:
                sqlOrder += 'p.position';
        }

        queryDatabaseOptions = {
            sqlStmt : sqlSelect + sqlStmt + sqlWhere + sqlOrder + sqlOffsetLimit,
            sqlParams : sqlParams
        };
        DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
            if (error) {
                callback(error);
                return;
            }


            callback(null, result.rows, meta);
        });
    });



}

function getProductsByPacktypeId(context, packtypeId, callback) {
    async.waterfall([
        function (callback) {
            var sqlStmt = "SELECT p.* FROM products p INNER JOIN variants v ON p.id = v.product_id WHERE v.packtype_id = $1 ORDER BY p.position;",
                sqlParams = [packtypeId],
                options = {
                    cache : {
                        key : cacheKey.productsByPacktypeId(packtypeId),
                        ttl : 60 * 60 * 24  // 24 hours
                    },
                    sqlStmt : sqlStmt,
                    sqlParams : sqlParams
                },
                productDao = daos.createDao('Product', context);

            productDao.queryDatabase(options, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, result.rows);
            });
        }
    ], callback);
}

function getStarterPromos(context, callback) {
    getProductsByTaxonName(context, 'Starter Promo', callback);
}

function getStarterPacks(context, callback) {
    getProductsByTaxonName(context, 'Starter Pack', callback);
}

function getPromoPacks(context, callback) {
    getProductsByTaxonName(context, 'Promo Pack', callback);
}

function getBusinessEntryKitsForCountry(context, countryId, callback) {
    getProductsByCountryIdAndTaxonName(context, countryId, 'Business Entry Kit', callback);
}

function getPreferredCustomerEntryKitsForCountry(context, countryId, callback) {
    getProductsByCountryIdAndTaxonName(context, countryId, 'Preferred Customer Entry Kit', callback);
}

function getSystemKitsForCountry(context, countryId, callback) {
    getProductsByCountryIdAndTaxonName(context, countryId, 'System', callback);
}

function getUpgradePacksForCountry(context, countryId, callback) {
    getProductsByCountryIdAndTaxonName(context, countryId, 'Upgrade Pack', callback);
}

function getPromoPacksForCountry(context, countryId, callback) {
    getProductsByCountryIdAndTaxonName(context, countryId, 'Promo Pack', callback);
}

function getStarterPromosForCountry(context, countryId, callback) {
    getProductsByCountryIdAndTaxonName(context, countryId, 'Starter Promo', callback);
}

function getStarterPacksForCountry(context, countryId, callback) {
    getProductsByCountryIdAndTaxonName(context, countryId, 'Starter Pack', callback);
}

function getBeveragesForCountry(context, countryId, callback) {
    getProductsByCountryIdAndTaxonName(context, countryId, 'Beverage', callback);
}

function getFoodSupplementsForCountry(context, countryId, callback) {
    getProductsByCountryIdAndTaxonName(context, countryId, 'Food Supplement', callback);
}

function getPersonalCaresForCountry(context, countryId, callback) {
    getProductsByCountryIdAndTaxonName(context, countryId, 'Personal Care', callback);
}

function getMarketingToolsForCountry(context, countryId, callback) {
    getProductsByCountryIdAndTaxonName(context, countryId, 'Marketing Tool', callback);
}

function getComboPacksForCountry(context, countryId, callback) {
    getProductsByCountryIdAndTaxonName(context, countryId, 'Combo Pack', callback);
}

function hasBoughtAnyProduct(context, user, products, callback) {
    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getBoughtVariantIdsOfUser(user, callback);
        },

        function (boughtVariantIds, callback) {
            var boughtVariantsIdMap = {},
                variantDao = daos.createDao('Variant', context);

            boughtVariantIds.forEach(function (variantId) {
                boughtVariantsIdMap[variantId] = variantId;
            });

            async.forEachSeries(products, function (product, next) {
                async.waterfall([
                    function (callback) {
                        variantDao.getVariantsOfProduct(product, callback);
                    },

                    function (variants, next) {
                        if (!variants.length) {
                            next();
                            return;
                        }

                        var variant = variants[0];
                        if (boughtVariantsIdMap[variant.id]) {
                            callback(null, true);
                            return;
                        }

                        next();
                    }
                ], next);
            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }
                callback(null, false);
            });
        }
    ], callback);
}

function rejectBoughtProducts(context, user, products, callback) {
    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getBoughtVariantIdsOfUser(user, callback);
        },

        function (boughtVariantIds, callback) {
            var productsNeverBought = [],
                boughtVariantsIdMap = {},
                variantDao = daos.createDao('Variant', context);

            boughtVariantIds.forEach(function (variantId) {
                boughtVariantsIdMap[variantId] = variantId;
            });

            async.forEachSeries(products, function (product, callback) {
                variantDao.getVariantsOfProduct(product, function (error, variants) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    var variant = variants[0];
                    if (!boughtVariantsIdMap[variant.id]) {
                        productsNeverBought.push(product);
                    }
                    callback();
                });
            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, productsNeverBought);
            });
        }
    ], callback);
}

function getGoldPacks(context, callback) {
    var goldPacks = [];

    async.waterfall([
        function (callback) {
            getProductsByPacktypeId(context, 3, callback);
        },

        function (products, callback) {
            goldPacks = goldPacks.concat(products);
            getProductsByPacktypeId(context, 4, callback);
        },

        function (products, callback) {
            goldPacks = goldPacks.concat(products);
            callback(null, goldPacks);
        }
    ], callback);
}

function hasBoughtAnyGoldPack(context, user, callback) {
    async.waterfall([
        function (callback) {
            getGoldPacks(context, callback);
        },

        function (products, callback) {
            hasBoughtAnyProduct(context, user, products, callback);
        }
    ], callback);
}

function getStarterProductsForCountry(context, countryId, callback) {
    var starterProducts = [];

    async.waterfall([
        function (callback) {
            getStarterPromosForCountry(context, countryId, callback);
        },

        function (products, callback) {
            starterProducts = starterProducts.concat(products);
            getStarterPacksForCountry(context, countryId, callback);
        },

        function (products, callback) {
            starterProducts = starterProducts.concat(products);
            callback(null, starterProducts);
        }
    ], callback);
}

function getStarterProducts(context, callback) {
    var starterProducts = [];

    async.waterfall([
        function (callback) {
            getStarterPromos(context, callback);
        },

        function (products, callback) {
            starterProducts = starterProducts.concat(products);
            getStarterPacks(context, callback);
        },

        function (products, callback) {
            starterProducts = starterProducts.concat(products);
            callback(null, starterProducts);
        }
    ], callback);
}

function hasBoughtAnyStarterProducts(context, user, callback) {
    async.waterfall([
        function (callback) {
            getStarterProducts(context, callback);
        },

        function (products, callback) {
            hasBoughtAnyProduct(context, user, products, callback);
        }
    ], callback);
}

function hasBoughtAnyPromoPacksWithPacktypeId(context, user, callback) {
    async.waterfall([
        function (callback) {
            getPromoPacks(context, callback);
        },

        function (products, callback) {
            var variantDao = daos.createDao('Variant', context),
                promoPacksWithPacktypeId = [];
            async.forEachSeries(products, function (product, callback) {
                variantDao.getVariantsOfProduct(product, function (error, variants) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    var variant = variants[0];
                    if (variant.packtype_id >= 0) {
                        promoPacksWithPacktypeId.push(product);
                    }

                    callback();
                });

            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, promoPacksWithPacktypeId);
            });
        },

        function (promoPacksWithPacktypeId, callback) {
            hasBoughtAnyProduct(context, user, promoPacksWithPacktypeId, callback);
        }
    ], callback);
}

function shouldIncludeStarterProducts(context, user, countryId, callback) {
    async.waterfall([
        function (next) {
            hasBoughtAnyStarterProducts(context, user, function (error, hasBought) {
                if (error) {
                    callback(error);
                    return;
                }

                if (hasBought) {
                    callback(null, false);
                    return;
                }

                next();
            });
        },

        function (callback) {
            hasBoughtAnyPromoPacksWithPacktypeId(context, user, function (error, hasBought) {
                if (error) {
                    callback(error);
                    return;
                }

                if (hasBought) {
                    callback(null, false);
                    return;
                }

                callback(null, true);
            });
        }
    ], callback);

}

function getUpgradePacksAvailableToUser(context, user, countryId, callback) {
    var userDao,
        lifetimeRank,
        upgradePacks = [];

    async.waterfall([
        function (callback) {
            shouldIncludeUpgradePacks(context, user, callback);
        },

        function (shouldInclude, next) {
            if (!shouldInclude) {
                callback(null, upgradePacks);
                return;
            }

            userDao = daos.createDao('User', context);
            userDao.getDistributorOfUser(user, next);
        },

        function (distributor, next) {
            lifetimeRank = distributor.lifetime_rank || 0;
            // if the lifetime rank is below MA, cannot upgrade
            if (lifetimeRank < Ranks.MA) {
                callback(null, upgradePacks);
                return;
            }

            getUpgradePacksForCountry(context, countryId, next);
        },

        function (products, callback) {
            var variantDao = daos.createDao('Variant', context);

            async.forEachSeries(products, function (product, callback) {
                async.waterfall([
                    function (callback) {
                        variantDao.getVariantsOfProduct(product, callback);
                    },

                    function (variants, callback) {
                        if (!variants.length) {
                            callback();
                            return;
                        }

                        var variant = variants[0];

                        // if the lifetime rank is MA, show MA upgrade pack
                        if (lifetimeRank < Ranks.SV) {
                            if (variant.upgrade_start_rankid === Ranks.MA) {
                                upgradePacks.push(product);
                            }
                            callback();
                            return;
                        }

                        // if the lifetime rank is SV, show SV upgrade pack
                        if (lifetimeRank < Ranks.CON) {
                            // since OG does not have upgrade from rak 60, we ill use the same upgrade pack as brzone
                            if (variant.upgrade_start_rankid === Ranks.MA) {
                                upgradePacks.push(product);
                            }
                            callback();
                            return;
                        }

                        // if the lifetime rank is CON, show silve => gold upgrade pack
                        if (lifetimeRank < Ranks.SC) {
                            if (variant.upgrade_start_rankid === Ranks.CON) {
                                hasBoughtAnyGoldPack(context, user, function (error, hasBought) {
                                    if (error) {
                                        callback(error);
                                        return;
                                    }

                                    if (!hasBought) {
                                        upgradePacks.push(product);
                                    }

                                    callback();
                                });
                            } else {
                                callback();
                            }
                            return;
                        }

                        callback();
                    }
                ], callback);
            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, upgradePacks);
            });
        }
    ], callback);
}

function getNormalProductsForCountry(context, countryId, callback) {
    var productsNormal = [],
        getters = [
            getBeveragesForCountry,
            getFoodSupplementsForCountry,
            getPersonalCaresForCountry,
            getMarketingToolsForCountry
        ];

    async.forEachSeries(getters, function (getter, callback) {
        getter(context, countryId, function (error, products) {
            if (error) {
                callback(error);
                return;
            }
            productsNormal = productsNormal.concat(products);
            callback();
        });
    }, function (error) {
        if (error) {
            callback(error);
            return;
        }
        callback(null, productsNormal);
    });
}

function getProductsKitAvailableToUser(context, user, countryId, callback) {
    var productsKit = [],
        steps = [
            {
                condition : shouldIncludeBusinessEntryKits,
                getter : getBusinessEntryKitsForCountry
            },
            {
                condition : shouldIncludePreferredCustomerEntryKits,
                getter : getPreferredCustomerEntryKitsForCountry
            },
            {
                condition : shouldIncludeSystemKits,
                getter : getSystemKitsForCountry
            }
        ];

    async.forEachSeries(steps, function (step, callback) {
        async.waterfall([
            step.condition.bind(this, context, user),

            function (shouldInclude, next) {
                if (!shouldInclude) {
                    callback();
                    return;
                }

                step.getter(context, countryId, next);
            },

            function (products, callback) {
                productsKit = productsKit.concat(products);
                callback();
            }
        ], callback);
    }, function (error) {
        if (error) {
            callback(error);
            return;
        }
        callback(null, productsKit);
    });
}

function getProductsPromotionalPackAvailableToUser(context, user, countryId, callback) {
    var productsPromotionalPack = [];

    async.waterfall([
        function (callback) {
            getUpgradePacksAvailableToUser(context, user, countryId, function (error, products) {
                if (error) {
                    callback(error);
                    return;
                }

                productsPromotionalPack = productsPromotionalPack.concat(products);
                callback();
            });
        },

        function (callback) {
            getPromoPacksForCountry(context, countryId, function (error, products) {
                if (error) {
                    callback(error);
                    return;
                }

                productsPromotionalPack = productsPromotionalPack.concat(products);
                callback();
            });
        },

        function (callback) {
            shouldIncludeStarterProducts(context, user, countryId, function (error, shouldInclude) {
                if (error) {
                    callback(error);
                    return;
                }

                // if bought start promo or starer pack, no right to buy any other start promo or starer pack
                if (!shouldInclude) {
                    callback();
                    return;
                }

                getStarterProductsForCountry(context, countryId, function (error, products) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    productsPromotionalPack = productsPromotionalPack.concat(products);
                    callback();
                });
            });
        },

        function (callback) {
            // product with id 895 is not available to user who registered after 2013-4-21
            if (!user.create_at ||
                    user.create_at > new Date(2013, 3, 21)) {
                productsPromotionalPack = u.reject(productsPromotionalPack, function (product) {
                    return product.id === 895;
                });
            }

            callback();
        },

        function (callback) {
            rejectBoughtProducts(context, user, productsPromotionalPack, callback);
        }
    ], callback);
}

/*
 * fill variants list to product details.
 *
 *  options = {
 *      roleId : <integer>,
 *      operatorRoleId : <integer>,
 *      catalogId : <integer>,
 *      catalogProductIds : <integer[]>,
 *      allowDeletedVariant : <boolean>,
 *      includeImages : <boolean>,
 *      includePrices : <boolean>,
 *      includeCommissions : <boolean>,
 *      includeOptions : <boolean>,
 *      includeCanAutoship : <boolean>
 *  }
 */
function fillVariantsToProducts(context, products, options, callback) {
    if (!products || !products.length) {
        callback();
        return;
    }

    context.logger.trace("filling variants to products...");

    var logger = context.logger,
        variantDao = daos.createDao('Variant', context),
        roleId = options.roleId,
        orderPriceTypeId = options.orderPriceTypeId,
        productsMap = {};

    products.forEach(function (product) {
        productsMap[product.catalog_product_id] = product;
    });

    async.waterfall([
        function (callback) {
            var queryVariantsOptions = {
                operatorRoleId : options.operatorRoleId,
                roleId : roleId,
                catalogId : options.catalogId,
                catalogProductIds : options.catalogProductIds,
                allowDeletedVariant : options.allowDeletedVariant,
                includeImages : options.includeImages,
                includePrices : options.includePrices,
                includeCommissions : options.includeCommissions,
                includeOptions : options.includeOptions,
                includeCanAutoship : options.includeCanAutoship
            };
            variantDao.queryVariants(queryVariantsOptions, callback);
        },

        function (variants, callback) {
            // don't display variants which price are not set.
            variants = u.filter(variants, function (variant) {
                if (!variant.price) {
                    return false;
                }

                return true;
            });

            callback(null, variants);
        },

        function (variants, callback) {
            async.forEachSeries(variants, function (variant, callback) {
                var product = productsMap[variant.catalog_product_id];
                if (!product) {
                    callback();
                    return;
                }

                if (!product.variants) {
                    product.variants = [];
                }
                product.variants.push(variant);

                if (variant.is_master) {
                    product.variant_id = variant.id;
                    product.price = variant.price;
                    product.suggested_price = variant.suggested_price;
                    product.sku = variant.sku;

                    if (!product.images || !product.images.length) {
                        product.images = variant.images;
                    }
                }

                callback();

            }, function (err) {
                callback(err);
            });
        }
    ], callback);
}

// TODO: deprecate
function fillSkuAndPriceToProducts(context, user, products, callback) {
    if (!products || !products.length) {
        callback();
        return;
    }

    var variantDao = daos.createDao('Variant', context),
        productsMap = {},
        productIds = products.map(function (product) {
            return product.id;
        });

    products.forEach(function (product) {
        productsMap[product.id] = product;
    });

    async.waterfall([
        function (callback) {
            variantDao.getVariantsInProductIds(productIds, callback);
        },

        function (variants, callback) {
            async.forEachSeries(variants, function (variant, callback) {
                var product = productsMap[variant.product_id];
                if (!product) {
                    callback();
                    return;
                }

                product.sku = variant.sku;

                async.waterfall([
                    function (callback) {
                        variantDao.getVariantPriceForUser(variant, user, 1, callback);
                    },

                    function (price, callback) {
                        product.price = price;
                        callback();
                    }
                ], callback);
            }, function (err) {
                callback(err);
            });
        }
    ], callback);
}

function fillImagesToProducts(context, products, callback) {
    if (!products || !products.length) {
        callback();
        return;
    }

    var assetDao = daos.createDao('Asset', context);
    var productThumbnailDao = daos.createDao('ProductThumbnail', context);
    var productsMap = {};
    var productIds = products.map(function (product) {
            return product.id;
        });
    var assetIds = [];

    products.forEach(function (product) {
        productsMap[product.id] = product;
    });

    async.waterfall([
        function (callback) {
            assetDao.getProductAssetsInIds(productIds, callback);
        },

        function (assets, callback) {
            assets.forEach(function (asset) {
                var product = productsMap[asset.viewable_id];
                if (product) {
                    if (!product.images) {
                        product.images = [];
                    }
                    product.images.push('/upload/image/' + asset.id + '/large_' + asset.attachment_file_name);
                }
            });

            callback();
        },
        function (callback){
            productThumbnailDao.getByProductIds(productIds, callback);
        },
        function (productThumbnails, callback){
            if(!u.isArray(productThumbnails)){
                callback(null, []);
                return;
            }
            assertIds = u.pluck(productThumbnails, 'asset_id');
            assetDao.getAssetsInIds(assertIds, callback);
        },
        function (assets, callback) {
            assets.forEach(function (asset) {
                var product = productsMap[asset.viewable_id];
                if (product) {
                    product.thumbnail = '/upload/image/' + asset.id + '/large_' + asset.attachment_file_name;
                }
            });

            callback();
        },
    ], callback);
}


function fillDefaultImagesToProducts(context, products, callback) {
    products.forEach(function (product) {
        if (!product.images || !product.images.length) {
            product.images = [];
        }
    });

    callback();
}


function fillPersonalizedTypesToProducts(context, products, callback) {
    if (!products || !products.length) {
        callback();
        return;
    }

    var productsMap = {},
        productIds = products.map(function (product) {
            return product.id;
        });

    products.forEach(function (product) {
        productsMap[product.id] = product;
    });

    async.waterfall([
        function (callback) {
            var queryDatabaseOptions = {
                sqlStmt : "select ptp.product_id, pt.id, pt.name, ptp.required from personalized_types_products ptp inner join personalized_types pt on pt.id = ptp.personalized_type_id where ptp.deleted_at is null and pt.active = true and ptp.product_id in (" + productIds.join(',') + ")",
                sqlParams : []
            };

            DAO.queryDatabase(context, queryDatabaseOptions, callback);
        },

        function (result, callback) {
            var rows = result.rows;

            rows.forEach(function (personalizedType) {
                var product = productsMap[personalizedType.product_id];
                if (product) {
                    if (!product.personalizedTypes) {
                        product.personalizedTypes = [];
                    }
                    product.personalizedTypes.push(personalizedType);
                }
            });

            callback();
        }
    ], callback);
}


function fillPropertiesToProducts(context, products, callback) {
    if (!products || !products.length) {
        callback();
        return;
    }

    var productsMap = {},
        productIds = products.map(function (product) {
            return product.id;
        });

    products.forEach(function (product) {
        productsMap[product.id] = product;
    });

    async.waterfall([
        function (callback) {
            var queryDatabaseOptions = {
                    sqlStmt : "select ppr.product_id, pr.id, pr.name, pr.presentation, ppr.value from product_properties ppr inner join properties pr on pr.id = ppr.property_id where ppr.product_id in (" + productIds.join(',') + ")",
                    sqlParams : []
                };

            DAO.queryDatabase(context, queryDatabaseOptions, callback);
        },

        function (result, callback) {
            var rows = result.rows;

            rows.forEach(function (property) {
                var product = productsMap[property.product_id];
                if (product) {
                    if (!product.properties) {
                        product.properties = {};
                    }
                    product.properties[property.name] = {
                        presentation: property.presentation,
                        value: property.value
                    };
                }
            });

            callback();
        }
    ], callback);
}


function sortProducts(products, sortBy) {
    var isDesc = false;
    var sortProperty = 'position';

    switch(sortBy) {
        case 'position':
            sortProperty = 'position';
            isDesc = false;
            break;
        case 'position-desc':
            sortProperty = 'position';
            isDesc = true;
            break;
        case 'name':
            sortProperty = 'name';
            isDesc = false;
            break;
        case 'name-desc':
            sortProperty = 'name';
            isDesc = true;
            break;
        case 'price':
            sortProperty = 'price';
            isDesc = false;
            break;
        case 'price-desc':
            sortProperty = 'price';
            isDesc = true;
            break;
    }

    products = u.sortBy(products, sortProperty);
    if (isDesc) {
        products.reverse();
    }

    return products;
}


// list all products by catalogs
Product.prototype.getAllProducts = function (distributorId, callback) {
    var options;

    options = {
        cache : {
            key : cacheKey.productCatalog(distributorId),
            ttl : 60 * 60 * 24  // 24 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_catalog_product_for_distributor($1, $2) order by sku',
        sqlParams: [distributorId, 60]
    };

    this.queryDatabase(options, callback);
};

Product.prototype.getProductsCatalogForUser = function (user, callback) {
    var context = this.context,
        userDao = daos.createDao('User', context),
        countryId,
        key = cacheKey.productCatalogByUserId(user.id),
        ttl = 60 * 60 * 24;

    async.waterfall([
        function (next) {
            // check cache
            cacheHelper.get(context, key, function (error, result) {
                if (error) {
                    next(null);
                    return;
                }

                if (result) {
                    callback(null, result);
                } else {
                    next(null);
                }
            });
        },

        function (callback) {
            userDao.getCountryOfUser(user, function (error, country) {
                if (error) {
                    callback(error);
                    return;
                }

                countryId = country.id;
                callback();
            });
        },

        function (callback) {
            async.series({
                kit : getProductsKitAvailableToUser.bind(this, context, user, countryId),
                promotionalPack : getProductsPromotionalPackAvailableToUser.bind(this, context, user, countryId),
                product : getNormalProductsForCountry.bind(this, context, countryId),
                comboPack : getComboPacksForCountry.bind(this, context, countryId)
            }, callback);
        },

        function (result, callback) {
            // fill sku for products
            async.waterfall([
                fillSkuAndPriceToProducts.bind(this, context, user, result.kit),
                fillSkuAndPriceToProducts.bind(this, context, user, result.promotionalPack),
                fillSkuAndPriceToProducts.bind(this, context, user, result.product),
                fillSkuAndPriceToProducts.bind(this, context, user, result.comboPack)
            ], function (error) {
                if (error) {
                    callback(error);
                    return;
                }
                callback(null, result);
            });
        },

        function (result, callback) {
            // fill images for products
            async.waterfall([
                fillImagesToProducts.bind(this, context, result.kit),
                fillImagesToProducts.bind(this, context, result.promotionalPack),
                fillImagesToProducts.bind(this, context, result.product),
                fillImagesToProducts.bind(this, context, result.comboPack)
            ], function (error) {
                if (error) {
                    callback(error);
                    return;
                }
                callback(null, result);
            });
        },

        function (result, callback) {
            result.kit = sortProducts(result.kit);
            result.promotionalPack = sortProducts(result.promotionalPack);
            result.product = sortProducts(result.product);
            result.comboPack = sortProducts(result.comboPack);

            callback(null, result);
        },

        function (result, callback) {
            cacheHelper.set(
                context,
                key,
                result,
                ttl,
                function (error) {
                    callback(null, result);
                }
            );
        }
    ], callback);
};


Product.prototype.getProductsCatalogForRegister = function (options, callback) {
    var context = this.context,
        countryId = options.countryId,
        roleName = options.roleName,
        key = cacheKey.productCatalogByCountryId(countryId),
        ttl = 60 * 60 * 24,
        user;

    async.waterfall([
        function (next) {
            // check cache
            cacheHelper.get(context, key, function (error, result) {
                if (error) {
                    next(null);
                    return;
                }

                if (result) {
                    callback(null, result);
                } else {
                    next(null);
                }
            });
        },

        function (callback) {
            var countryDao = daos.createDao('Country', context);
            countryDao.getCountryById(countryId, callback);
        },

        function (country, callback) {
            user = {
                roles : [
                    {
                        name : roleName
                    }
                ],
                distributor : {
                    lifetime_rank : 0
                },
                homeAddress : {
                    country_id : countryId
                }
            };
            callback();
        },

        function (callback) {
            async.series({
                kit : getProductsKitAvailableToUser.bind(this, context, user, countryId),
                promotionalPack : getProductsPromotionalPackAvailableToUser.bind(this, context, user, countryId),
                product : getNormalProductsForCountry.bind(this, context, countryId),
                comboPack : getComboPacksForCountry.bind(this, context, countryId)
            }, callback);
        },

        function (result, callback) {
            // fill sku for products
            async.waterfall([
                fillSkuAndPriceToProducts.bind(this, context, user, result.kit),
                fillSkuAndPriceToProducts.bind(this, context, user, result.promotionalPack),
                fillSkuAndPriceToProducts.bind(this, context, user, result.product),
                fillSkuAndPriceToProducts.bind(this, context, user, result.comboPack)
            ], function (error) {
                if (error) {
                    callback(error);
                    return;
                }
                callback(null, result);
            });
        },

        function (result, callback) {
            // fill images for products
            async.waterfall([
                fillImagesToProducts.bind(this, context, result.kit),
                fillImagesToProducts.bind(this, context, result.promotionalPack),
                fillImagesToProducts.bind(this, context, result.product),
                fillImagesToProducts.bind(this, context, result.comboPack)
            ], function (error) {
                if (error) {
                    callback(error);
                    return;
                }
                callback(null, result);
            });
        },

        function (result, callback) {
            result.kit = sortProducts(result.kit);
            result.promotionalPack = sortProducts(result.promotionalPack);
            result.product = sortProducts(result.product);
            result.comboPack = sortProducts(result.comboPack);

            callback(null, result);
        },

        function (result, callback) {
            cacheHelper.set(
                context,
                key,
                result,
                ttl,
                function (error) {
                    callback(null, result);
                }
            );
        }
    ], callback);
};

function getPropertiesOfProduct(context, product, callback) {
    async.waterfall([
        function (callback) {
            var queryDatabaseOptions = {
                    sqlStmt : "SELECT pp.*, p.name, p.presentation FROM product_properties pp INNER JOIN properties p ON pp.property_id = p.id WHERE pp.product_id = $1",
                    sqlParams : [product.id]
                };

            DAO.queryDatabase(context, queryDatabaseOptions, callback);
        },

        function (result, callback) {
            var properties = {};

            result.rows.forEach(function (productProperty) {
                properties[productProperty.name] = {
                    presentation : productProperty.presentation,
                    value : productProperty.value
                };
            });

            callback(null, properties);
        }
    ], callback);
}


function ftoFilterFoundingHandlerRenewalProducts(context, user, products, callback) {
    var logger = context.logger,
        ftoLatestFoundingDistributorId = context.config.application['fto-latest-founding-distributor-id'],
        systemTaxonId = 2;

    logger.debug("filtering founding handler renewal products...");
    logger.debug("latest founding distributor id: %d", ftoLatestFoundingDistributorId);

    if (!ftoLatestFoundingDistributorId) {
        logger.debug("latest founding distributor id was not set. no need to filter products.");
        callback(null, products);
        return;
    }

    async.waterfall([
        function (callback) {
            var taxonDao = daos.createDao('Taxon', context);
            taxonDao.getTaxonByName("System", function (error, taxon) {
                if (error) {
                    callback(error);
                    return;
                }

                if (taxon) {
                    systemTaxonId = taxon.id;
                }

                callback();
                return;
            });
        },

        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getDistributorOfUser(user, callback);
        },

        function (distributor, callback) {
            var isFoundingDistributor = distributor.id <= ftoLatestFoundingDistributorId,
                filteredProducts = [];

            logger.debug("current user %s founding distributor.", isFoundingDistributor ? 'is' : 'is not');

            async.forEachSeries(products, function (product, callback) {
                if (product.taxon_id != systemTaxonId) {
                    filteredProducts.push(product);
                    callback();
                    return;
                }

                getPropertiesOfProduct(context, product, function (error, productProperties) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    logger.debug("properties of product %d: %j", product.id, productProperties);

                    var isFoundingHandlerRenewalProduct = !!productProperties['founding-handler-renewal'];
                    if (isFoundingDistributor) {
                        if (isFoundingHandlerRenewalProduct) {
                            filteredProducts.push(product);
                        }
                    } else {
                        if (!isFoundingHandlerRenewalProduct) {
                            filteredProducts.push(product);
                        }
                    }

                    callback();
                });
            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, filteredProducts);
            });
        }
    ], callback);
}


/**
 * Get products
 *
 *  options : {
 *      countryId : <integer>,
 *      roleId : <integer>,
 *      operatorRoleId : <integer> role id of the current user
 *      taxonId : <integer>,
 *      taxonIds : <integer[]>, //optional
 *      isFeatured : <boolean>, //optional
 *      query : <string>, //optional
 *      offset: <integer>, //optional
 *      limit: <integer>, //optional
 *      catalogCode : <string>,
 *      sortBy : <String> optional. `position`, `name`, `price`. `position` as default.
 *      sku: <String> //optional
 *  }
 *
 * @param context {Object} context object.
 * @param options {Object} query options.
 * @param callback {Function} callback function.
 */
Product.prototype.getProducts = function (options, callback) {
    var self = this,
        context = this.context,
        products,
        meta,
        error;

    async.waterfall([
        function (callback) {
            var catalogDao = daos.createDao('Catalog', context);
            catalogDao.getCatalogByCode(options.catalogCode, function (error, catalog) {
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
                callback();
            });
        },

        function (callback) {
            // validate permission
            var roleshipDao = daos.createDao('Roleship', context),
                validatePermissionOptions = {
                    sourceRoleId : options.operatorRoleId,
                    destinationRoleId : options.roleId,
                    catalogId : options.catalogId
                };

            roleshipDao.validatePermission(validatePermissionOptions, function (error, hasPermission) {
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

        function (callback) {
            var queryProductsOptions = {
                countryId : options.countryId,
                roleId : options.roleId,
                taxonId : options.taxonId,
                taxonIds : options.taxonIds,
                isFeatured : options.isFeatured,
                query: options.query,
                offset: options.offset,
                limit: options.limit,
                catalogId : options.catalogId,
                sortBy: options.sortBy,
                sku: options.sku
            };
            queryProducts(context, queryProductsOptions, function (error, result, metaResult) {
                if (error) {
                    callback(error);
                    return;
                }

                products = result;
                meta = metaResult;
                callback();
            });
        },

        function (callback) {
            fillImagesToProducts(context, products, callback);
        },

        function (callback) {
            var catalogProductIds = products.map(function (product) {
                    return product.catalog_product_id;
                }),
                fillVariantsOptions = {
                    operatorRoleId : options.operatorRoleId,
                    roleId : options.roleId,
                    catalogId : options.catalogId,
                    catalogProductIds : catalogProductIds,
                    includeImages : true,
                    includePrices : true,
                    includeCommissions : true,
                    includeOptions : true,
                    includeCanAutoship : true
                };
            fillVariantsToProducts(context, products, fillVariantsOptions, callback);
        },

        function (callback) {
            // don't display products which don't have any variant.
            products = u.filter(products, function (product) {
                if (!product.variants || !product.variants.length) {
                    return false;
                }

                return true;
            });
            callback();
        },

        function (callback) {
            fillDefaultImagesToProducts(context, products, callback);
        },

        function (callback) {
            fillPersonalizedTypesToProducts(context, products, callback);
        },

        function (callback) {
            fillPropertiesToProducts(context, products, callback);
        },

        function (callback) {
            // fill catalog code
            products.forEach(function (product) {
                product.catalogCode = options.catalogCode;
            });
            callback();
        }
        // ,
        // function (callback) {
        //     products = sortProducts(products, options.sortBy);
        //     callback(null, products);
        // }
    ], function(error){
        if(error){
            return callback(error);
        }

        callback(null, products, meta);
    });
};

/**
 * Get products available for current user
 *
 *  options : {
 *      userId : <Integer> required
 *      catalogCode : <String> required
 *      taxonId : <Integer> optional
 *      taxonIds : <integer[]>, //optional
 *      isFeatured : <boolean>, //optional
 *      query : <string>, //optional
 *      offset: <integer>, //optional
 *      limit: <integer>, //optional
 *      roleCode : <String> optional
 *      sortBy : <String> optional. `position`, `name`, `price`. `position` as default.
 *      sku: <String> optional.
 *  }
 *
 * @param context {Object} context object.
 * @param options {Object} query options.
 * @param callback {Function} callback function.
 */
Product.prototype.getProductsForUser = function (options, callback) {
    var self = this,
        context = this.context,
        userDao = daos.createDao('User', context),
        userId = options.userId,
        user,
        roleId,
        operatorRoleId,
        countryId,
        products,
        meta,
        error;

    async.waterfall([
        function (callback) {
            userDao.getById(userId, callback);
        },

        function (result, callback) {
            user = result;
            userDao.getRolesOfUser(user, callback);
        },

        function (roles, next) {
            if (!roles.length) {
                callback(null, []);
                return;
            }

            operatorRoleId = roles[0].id;

            if (!options.roleCode) {
                roleId = operatorRoleId;
                next();
                return;
            }

            var roleDao = daos.createDao('Role', context);
            roleDao.getRoleByCode(options.roleCode, function (error, role) {
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

                roleId = role.id;
                next();
            });
        },

        function (callback) {
            userDao.getCountryOfUser(user, callback);
        },

        function (country, callback) {
            if (!country) {
                error = new Error('Your home address are invalid.');
                error.errorCode = 'InvalidHomeAddress';
                error.statusCode = 403;
                callback(error);
                return;
            }

            var getProductsOptions = {
                countryId : country.id,
                roleId : roleId,
                operatorRoleId : operatorRoleId,
                taxonId : options.taxonId,
                taxonIds : options.taxonIds,
                isFeatured : options.isFeatured,
                query: options.query,
                offset: options.offset,
                limit: options.limit,
                catalogCode : options.catalogCode,
                sortBy : options.sortBy,
                sku: options.sku
            };
            self.getProducts(getProductsOptions, function(error, productsResult, metaResult){
                if(error){
                    callback(error);
                    return;
                }
                products = productsResult;
                meta = metaResult;
                callback();

            });
        },

        function (callback) {
            ftoFilterFoundingHandlerRenewalProducts(context, user, products, function (error, filteredProducts) {
                if (error) {
                    callback(error);
                    return;
                }

                products = filteredProducts;
                callback();
            });
        }
    ], function(error){
        if(error){
            return callback(error);
        }

        callback(null, products, meta);
    });
};

/**
 * Get products available for a role
 *
 *  options : {
 *      countryId : <Integer> required
 *      catalogCode : <String> required
 *      taxonId : <Integer> optional
 *      taxonIds : <integer[]>, //optional
 *      isFeatured : <boolean>, //optional
 *      query : <string>, //optional
 *      offset: <integer>, //optional
 *      limit: <integer>, //optional
 *      roleCode : <String> required
 *      sortBy : <String> optional. `position`, `name`, `price`. `position` as default.
 *      sku: <String> optional.
 *  }
 *
 * @param context {Object} context object.
 * @param options {Object} query options.
 * @param callback {Function} callback function.
 */
Product.prototype.getProductsForRole = function (options, callback) {
    var self = this,
        context = this.context,
        userDao = daos.createDao('User', context),
        roleId,
        products,
        meta,
        error;

    if (!options.roleCode) {
        error = new Error("Role code is required.");
        error.errorCode = 'InvalidRoleCode';
        error.statusCode = 400;
        callback(error);
        return;
    }

    async.waterfall([
        function (callback) {
            var roleDao = daos.createDao('Role', context);
            roleDao.getRoleByCode(options.roleCode, function (error, role) {
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

                roleId = role.id;
                callback();
            });
        },

        function (callback) {
            var countryDao = daos.createDao('Country', context);
            countryDao.getCountryById(options.countryId, function (error, country) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!country) {
                    error = new Error("Country with id '" + options.countryId + "' does not exist.");
                    error.errorCode = 'InvalidCountryId';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {

            var getProductsOptions = {
                countryId : options.countryId,
                roleId : roleId,
                operatorRoleId : roleId,
                taxonId : options.taxonId,
                taxonIds : options.taxonIds,
                isFeatured : options.isFeatured,
                query: options.query,
                offset: options.offset,
                limit: options.limit,
                catalogCode : options.catalogCode,
                sortBy : options.sortBy,
                sku : options.sku
            };
            self.getProducts(getProductsOptions, function(error, productsResult, metaResult){
                if(error){
                    callback(error);
                    return;
                }
                products = productsResult;
                meta = metaResult;
                callback();

            });
        }
    ], function(error){
        if(error){
            return callback(error);
        }

        callback(null, products, meta);
    });
};

/*
 * get one product details for user
 *  options = {
 *      userId : <integer>, required
 *      productId : <integer>, required
 *      catalogCode : <string>, required
 *      roleCode : <string>, optional
 *      allowDeletedProduct : <boolean>, optional
 *  }
 */
Product.prototype.getProductDetailsForUser = function (options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        userDao = daos.createDao('User', context),
        catalogDao,
        userId = options.userId,
        user,
        productId = options.productId,
        products,
        error;

        // if (!productId || !u.isNumber(productId) || productId <= 0) {
        //     error = new Error('InvalidProductId.');
        //     error.errorCode = 'InvalidProductId';
        //     error.statusCode = 400;
        //     callback(error);
        //     return;
        // }

    logger.trace("Getting product details...");
    async.waterfall([
        function (callback) {
            userDao.getById(userId, callback);
        },

        function (result, callback) {
            user = result;
            userDao.getRolesOfUser(user, callback);
        },

        function (roles, next) {
            if (!roles.length) {
                callback(null, null);
                return;
            }

            options.operatorRoleId = roles[0].id;

            if (!options.roleCode) {
                options.roleId = options.operatorRoleId;
                next();
                return;
            }

            var roleDao = daos.createDao('Role', context);
            roleDao.getRoleByCode(options.roleCode, function (error, role) {
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
                next();
            });
        },

        function (callback) {
            // checkout country of product
            userDao.getCountryOfUser(user, function (error, country) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!country) {
                    error = new Error("Can't get country of user " + user.id);
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                self.canProductSellInCountry(productId, country.id, function (error, canSell) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!canSell) {
                        error = new Error("Product " + productId + " does not sell in country " + country.iso3);
                        error.statusCode = 403;
                        callback(error);
                        return;
                    }

                    callback();
                });
            });
        },

        function (callback) {
            logger.trace("Finding product with id %d from database...", productId);
            context.readModels.Product.find(productId).done(callback);
        },

        function (product, next) {
            if (!product ||
                    (product.deleted_at && !options.allowDeletedProduct)) {
                callback(null, null);
                return;
            }

            logger.trace("Getting taxon of product %d.", product.id);
            var queryDatabaseOptions = {
                    sqlStmt : "SELECT * FROM products_taxons WHERE product_id = $1",
                    sqlParams : [product.id]
                };
            self.queryDatabase(queryDatabaseOptions, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                if (result.rows && result.rows.length) {
                    product.taxon_id = result.rows[0].taxon_id;
                }

                products = [product];
                next();
            });
        },

        function (callback) {
            catalogDao = daos.createDao('Catalog', context);

            if (options.catalogId) {
                catalogDao.getById(options.catalogId, function (error, catalog) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!catalog) {
                        error = new Error("Invalid catalog id.");
                        error.errorCode = 'InvalidCatalogId';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    options.catalogCode = catalog.code;
                    callback();
                });
                return;
            }

            catalogDao.getCatalogByCode(options.catalogCode, function (error, catalog) {
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
                callback();
            });
        },

        function (callback) {
            // validate permission
            var roleshipDao = daos.createDao('Roleship', context),
                validatePermissionOptions = {
                    sourceRoleId : options.operatorRoleId,
                    destinationRoleId : options.roleId,
                    catalogId : options.catalogId
                };

            roleshipDao.validatePermission(validatePermissionOptions, function (error, hasPermission) {
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

        function (callback) {
            fillImagesToProducts(context, products, callback);
        },

        function (callback) {
            catalogDao.getCatalogProduct(options.roleId, options.catalogId, productId, callback);
        },

        function (catalogProduct, callback) {
            var fillVariantsOptions,
                error;

            if (!catalogProduct ||
                    (catalogProduct.deleted_at && !options.allowDeletedProduct)) {
                error = new Error("No permission to get product details.");
                error.errorCode = 'NoPermissionToGetProduct';
                error.statusCode = 403;
                callback(error);
                return;
            }

            products[0].catalog_product_id = catalogProduct.id;

            fillVariantsOptions = {
                operatorRoleId : options.operatorRoleId,
                roleId : options.roleId,
                catalogId : options.catalogId,
                catalogProductIds : [catalogProduct.id],
                allowDeletedVariant : options.allowDeletedProduct,
                includeImages : true,
                includePrices : true,
                includeCommissions : true,
                includeOptions : true,
                includeCanAutoship : true
            };
            fillVariantsToProducts(context, products, fillVariantsOptions, callback);
        },

        function (callback) {
            fillDefaultImagesToProducts(context, products, callback);
        },

        function (callback) {
            fillPersonalizedTypesToProducts(context, products, callback);
        },

        function (callback) {
            // fill catalog code
            products.forEach(function (product) {
                product.catalogCode = options.catalogCode;
            });
            callback();
        },

        function (callback) {
            callback(null, products[0]);
        }

    ], callback);
};

/*
 * get one product details for role
 *  options = {
 *      productId : <integer>, required
 *      catalogCode : <string>, required
 *      roleCode : <string>, required
 *      allowDeletedProduct : <boolean>, optional
 *  }
 */
Product.prototype.getProductDetailsForRole = function (options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        userDao = daos.createDao('User', context),
        catalogDao,
        productId = options.productId,
        products,
        error;

    logger.trace("Getting product details...");

    if (!options.roleCode) {
        error = new Error("Role code is required.");
        error.errorCode = 'InvalidRoleCode';
        error.statusCode = 400;
        callback(error);
        return;
    }

    // if (!productId || !u.isNumber(productId) || productId <= 0) {
    //     error = new Error('InvalidProductId.');
    //     error.errorCode = 'InvalidProductId';
    //     error.statusCode = 400;
    //     callback(error);
    //     return;
    // }

    async.waterfall([
        function (callback) {
            var roleDao = daos.createDao('Role', context);
            roleDao.getRoleByCode(options.roleCode, function (error, role) {
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

        function (callback) {
            logger.trace("Finding product with id %d from database...", productId);
            context.readModels.Product.find(productId).done(callback);
        },

        function (product, next) {
            if (!product ||
                    (product.deleted_at && !options.allowDeletedProduct)) {
                callback(null, null);
                return;
            }

            logger.trace("Getting taxon of product %d.", product.id);
            var queryDatabaseOptions = {
                    sqlStmt : "SELECT * FROM products_taxons WHERE product_id = $1",
                    sqlParams : [product.id]
                };
            self.queryDatabase(queryDatabaseOptions, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                if (result.rows && result.rows.length) {
                    product.taxon_id = result.rows[0].taxon_id;
                }

                products = [product];
                next();
            });
        },

        function (callback) {
            catalogDao = daos.createDao('Catalog', context);
            catalogDao.getCatalogByCode(options.catalogCode, function (error, catalog) {
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
                callback();
            });
        },

        function (callback) {
            // validate permission
            var roleshipDao = daos.createDao('Roleship', context),
                validatePermissionOptions = {
                    sourceRoleId : options.roleId,
                    destinationRoleId : options.roleId,
                    catalogId : options.catalogId
                };

            roleshipDao.validatePermission(validatePermissionOptions, function (error, hasPermission) {
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

        function (callback) {
            fillImagesToProducts(context, products, callback);
        },

        function (callback) {
            catalogDao.getCatalogProduct(options.roleId, options.catalogId, productId, callback);
        },

        function (catalogProduct, callback) {
            var fillVariantsOptions,
                error;

            if (!catalogProduct) {
                error = new Error("No permission to get product details.");
                error.errorCode = 'NoPermissionToGetProduct';
                error.statusCode = 403;
                callback(error);
                return;
            }

            products[0].catalog_product_id = catalogProduct.id;

            fillVariantsOptions = {
                operatorRoleId : options.roleId,
                roleId : options.roleId,
                catalogId : options.catalogId,
                catalogProductIds : [catalogProduct.id],
                allowDeletedVariant : options.allowDeletedProduct,
                includeImages : true,
                includePrices : true,
                includeCommissions : true,
                includeOptions : true,
                includeCanAutoship : true
            };
            fillVariantsToProducts(context, products, fillVariantsOptions, callback);
        },

        function (callback) {
            fillDefaultImagesToProducts(context, products, callback);
        },

        function (callback) {
            fillPersonalizedTypesToProducts(context, products, callback);
        },

        function (callback) {
            // fill catalog code
            products.forEach(function (product) {
                product.catalogCode = options.catalogCode;
            });
            callback();
        },

        function (callback) {
            callback(null, products[0]);
        }

    ], callback);
};

Product.prototype.getCountriesOfProduct = function (productId, callback) {
    this.readModels.Product.find({
        where: {id : productId}
    }).success(function (product) {
        product.getCountries().success(function (countries) {
            callback(null, countries);
        }).error(callback);
    }).error(callback);
};


Product.prototype.canProductSellInCountry = function (productId, countryId, callback) {
    var self = this;

    async.waterfall([
        function (callback) {
            self.getCountriesOfProduct(productId, callback);
        },

        function (countries, callback) {
            var canSell = !!u.find(countries, function (country) {
                return country.id === countryId;
            });
            callback(null, canSell);
        }
    ], callback);
};


Product.prototype.getTaxonsOfProduct = function (product, callback) {
    if (product.taxons) {
        callback(null, product.taxons);
        return;
    }

    product.getTaxons().success(function (taxons) {
        product.taxons = taxons;
        callback(null, taxons);
    }).error(callback);
};


Product.prototype.isProductInTaxonByName = function (product, taxonName, callback) {
    var self = this,
        logger = this.context.logger;

    logger.debug("Checking if product %d is in taxon '%s'", product.id, taxonName);
    async.waterfall([
        function (callback) {
            self.getTaxonsOfProduct(product, callback);
        },

        function (taxons, callback) {
            var i,
                len = taxons.length,
                taxon;

            for (i = 0; i < len; i += 1) {
                taxon = taxons[i];
                if (taxon.name && taxonName && (taxon.name.trim().toLowerCase() === taxonName.toLowerCase())) {
                    callback(null, true);
                    return;
                }
            }

            callback(null, false);
        }
    ], callback);
};


Product.prototype.isProductInTaxonByNames = function (product, taxonNames, callback) {
    var self = this,
        logger = this.context.logger;

    taxonNames = taxonNames.map(function (taxonName) {
        return taxonName && taxonName.toLowerCase();
    });

    logger.debug("Checking if product %d is in taxons '%s'", product.id, taxonNames);
    async.waterfall([
        function (callback) {
            self.getTaxonsOfProduct(product, callback);
        },

        function (taxons, callback) {
            logger.info("product taxons:", JSON.stringify(taxons), " taxonNames:", taxonNames);
            var i,
                len = taxons.length,
                taxon;

            for (i = 0; i < len; i += 1) {
                taxon = taxons[i];
                if (taxon.name && (taxonNames.indexOf(taxon.name.trim().toLowerCase()) !== -1)) {
                    callback(null, true);
                    return;
                }
            }

            callback(null, false);
        }
    ], callback);
};


Product.prototype.getProductPurchaseTypes = function (callback) {
    var context = this.context;
    context.readModels.ProductPurchaseType.findAll().done(callback);
};

Product.prototype.getProductPurchaseTypeByCode = function (code, callback) {
    var context = this.context;
    context.readModels.ProductPurchaseType.find({
        where : { code : code }
    }).done(callback);
};

Product.prototype.getOrderPriceTypes = function (callback) {
    var context = this.context;
    context.readModels.OrderPriceType.findAll().done(callback);
};

Product.prototype.getOrderPriceTypeByCode = function (code, callback) {
    var context = this.context,
        logger = context.logger;

    logger.trace("Getting order price type with code '%s'...", code);
    context.readModels.OrderPriceType.find({
        where : { code : code }
    }).done(callback);
};


Product.prototype.getShippingCategoryByProductId = function (productId, callback) {
    var self = this,
        context = this.context;

    async.waterfall([
        function (callback) {
            self.getById(productId, callback);
        },

        function (product, callback) {
            var shippingCategoryDao = daos.createDao('ShippingCategory', context);
            shippingCategoryDao.getShippingCategoryById(product.shipping_category_id, callback);
        }
    ], callback);
};


Product.prototype.getPropertiesOfProduct = function (product, callback) {
    var context = this.context;
    getPropertiesOfProduct(context, product, callback);
};


Product.prototype.getPersonalizedTypeOfProductById = function (productId, personalizedTypeId, callback) {
    var context = this.context,
        personalizedType;

    async.waterfall([
        function (callback) {
            context.readModels.PersonalizedType.find(personalizedTypeId).done(function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                personalizedType = result;
                if (!personalizedType) {
                    error = new Error('Can not find PersonalizedType with id: ' + personalizedTypeId);
                    error.errorCode = 'InvalidPersonalizedTypeId';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            var queryDatabaseOptions = {
                    sqlStmt : "select * from personalized_types_products where personalized_type_id = $1 and product_id = $2 and deleted_at is null",
                    sqlParams : [personalizedTypeId, productId]
                };
            DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!result.rows.length) {
                    error = new Error("Personalized type " + personalizedTypeId + " is invalid to product " + productId);
                    error.errorCode = 'InvalidPersonalizedTypeId';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                var personalizedTypeProduct = result.rows[0];
                personalizedType.required = personalizedTypeProduct.required;

                callback(null, personalizedType);
            });
        }
    ], callback);
};


Product.prototype.isProductAvailableInCountry = function (productId, countryId, callback) {
    var context = this.context;

    async.waterfall([
        function (callback) {
            var queryDatabaseOptions = {
                sqlStmt: "select * from countries_products where country_id=$1 and product_id=$2",
                sqlParams: [countryId, productId]
            };

            DAO.queryDatabase(context, queryDatabaseOptions, callback);
        },

        function (result, callback) {
            var isAvailable = result.rows.length > 0;
            callback(null, isAvailable);
        }
    ], callback);
};

Product.prototype.addPropertyInfoToProducts = function (options, callback) {
    var products = options.products;
    var context = this.context;

    if(products.length === 0){
        callback(null, []);
        return;
    }

    var product_ids = products.map(function (p) {
        return p.id;
    });
    async.waterfall([
        function (callback) {
            var queryDatabaseOptions = {
                    sqlStmt: "SELECT pp.*, p.name, p.presentation FROM product_properties pp INNER JOIN properties p ON pp.property_id = p.id WHERE pp.product_id in ("+ product_ids.join(',') +") ",
                    sqlParams: []
                };

            DAO.queryDatabase(context, queryDatabaseOptions, callback);
        },

        function (result, callback) {
            products.forEach(function (product){
                product.properties = {};
                product.propertyNames = [];
                result.rows.forEach(function (productProperty) {
                    if(productProperty.product_id === product.id){
                        context.logger.debug("productProperty.product_id:", productProperty.product_id, "product.id:", product.id);
                        product.properties[productProperty.name] = {
                            presentation : productProperty.presentation,
                            value : productProperty.value
                        };
                        product.propertyNames.push(productProperty.name);
                    }
                });
            });

            callback(null, products);
        }
    ], callback);
};


module.exports = Product;

sidedoor.expose(module, 'privateAPIes', {
    getVariantIdOfProductNamedProReplicatedWebsite : getVariantIdOfProductNamedProReplicatedWebsite,
    getProductsByCountryIdAndTaxonName : getProductsByCountryIdAndTaxonName,
    getBusinessEntryKitsForCountry : getBusinessEntryKitsForCountry,
    getPreferredCustomerEntryKitsForCountry : getPreferredCustomerEntryKitsForCountry,
    getSystemKitsForCountry : getSystemKitsForCountry,
    getProductsPromotionalPackAvailableToUser : getProductsPromotionalPackAvailableToUser
});

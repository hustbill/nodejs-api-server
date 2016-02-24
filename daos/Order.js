/**
 * Order DAO class.
 */

var util = require('util');
var u = require('underscore');
var async = require('async');
var uuid = require('node-uuid');
var moment = require('moment');
var DAO = require('./DAO');
var daos = require('./index');
var UserDao = require('./User');
var AddressDao = require('./Address');
var CountryDao = require('./Country');
var calculators = require('../lib/calculators');
var fraudPrevention = require('../lib/fraudPrevention');
var utils = require('../lib/utils');
var avalara = require('../lib/avalara');
var fraudPrevention = require('../lib/fraudPrevention');
var cacheKey = require('../lib/cacheKey');
var cacheHelper = require('../lib/cacheHelper');
var mailHelper = require('../lib/mailHelper');
var mailService = require('../lib/mailService');
var partyPlanningService = require('../lib/partyPlanningService');
var orderPlugins = require('../lib/orderPlugins');
var mapper = require('../mapper');

var sidedoor = require('sidedoor');

function Order(context) {
    DAO.call(this, context);
}

util.inherits(Order, DAO);


function getRoleCodeFromOrder(order){
    if(!order){
        return null;
    }

    if(order.roleCode){
        return  order.roleCode;
    }

    if(!order.lineItems || order.lineItems.length === 0){
        return  null;
    }

    return  order.lineItems[0].roleCode  || order.lineItems[0].role_code;

}

function fireOrderEvent(context, operation, eventName, options, order, callback) {
    var logger = context.logger;

    logger.debug("fire %s.%s event...", operation, eventName);
    orderPlugins.processOrderEvent(context, operation, eventName, options, order, callback);
}


function findAddressInArrayById(addressArray, addressId) {
    if (!addressArray) {
        return null;
    }

    var len = addressArray.length,
        i,
        address;

    for (i = 0; i < len; i += 1) {
        address = addressArray[i];
        if (address.id === addressId) {
            return address;
        }
    }

    return null;
}


function getVariantFromVariantsById(variants, id) {
    var i,
        length,
        variant;
    for (i = 0, length = variants.length; i < length; i += 1) {
        variant = variants[i];
        if (variant.id === id) {
            return variant;
        }
    }
    return null;
}


function getVariantCommissionVolume(variant, commissionCode) {
    if (!variant.commissions) {
        return 0;
    }

    var commission,
        i;

    for (i = 0; i < variant.commissions.length; i += 1) {
        commission = variant.commissions[i];

        if (commission.code === commissionCode) {
            return commission.volume || 0;
        }
    }

    return 0;
}


function fillCommissionsVolumesToLineItem(context, lineItem, variant) {
    var lineItemCommissionsConfig = context.config.application.lineItemCommissions,
        lineItemCommissionTypes = [
            'dt_volume',
            'ft_volume',
            'u_volume',
            'q_volume',
            'r_volume'
        ],
        volume;

    if (!lineItemCommissionsConfig) {
        lineItemCommissionsConfig = {
            u_volume : "PV",
            q_volume : "PV",
            r_volume : "PV"
        };
    }

    lineItemCommissionTypes.forEach(function (lineItemCommissionType) {
        if (lineItemCommissionsConfig.hasOwnProperty(lineItemCommissionType)) {
            volume = getVariantCommissionVolume(variant, lineItemCommissionsConfig[lineItemCommissionType]);
        } else {
            volume = 0;
        }

        lineItem[lineItemCommissionType] = utils.roundVolume(volume * lineItem.quantity);
    });
}


function fillPersonalizedTypeNameToPersonalizedValues(context, personalizedValues, productId, callback) {
    if (!personalizedValues || !personalizedValues.length) {
        callback();
        return;
    }

    async.forEachSeries(personalizedValues, function (personalizedValue, callback) {
        var productDao = daos.createDao('Product', context);
        productDao.getPersonalizedTypeOfProductById(productId, personalizedValue.id, function (error, personalizedType) {
            if (error) {
                callback(error);
                return;
            }

            personalizedValue.name = personalizedType.name;
            callback();
        });
    }, function (error) {
        callback(error);
    });
}


function fillPersonalizedValuesToLineItems(context, lineItems, callback) {
    var queryDatabaseOptions,
        lineItemIds;

    lineItemIds = lineItems.map(function (lineItem) {
        return lineItem.id;
    });

    queryDatabaseOptions = {
        sqlStmt : "select pv.line_item_id, pt.id, pt.name, pv.personalized_value as value from line_items_personalized_values pv inner join personalized_types pt on pv.personalized_type_id = pt.id where pv.line_item_id in (" + lineItemIds.join(',') + ")",
        sqlParams : []
    };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        if (!result.rows.length) {
            callback();
            return;
        }

        var lineItemMapById = {};
        lineItems.forEach(function (lineItem) {
            lineItemMapById[lineItem.id] = lineItem;
        });

        result.rows.forEach(function (personalizedValue) {
            var lineItem = lineItemMapById[personalizedValue.line_item_id];
            if (lineItem) {
                if (!lineItem.personalizedValues) {
                    lineItem.personalizedValues = [];
                }

                lineItem.personalizedValues.push({
                    id : personalizedValue.id,
                    name : personalizedValue.name,
                    value : personalizedValue.value
                });
            }
        });

        callback();
    });
}


/**
 * Get zone ids of the given address
 * @param context {Object} Request context.
 * @param address {Object} Address entity.
 * @param callback {Function} Callback function.
 */
function getZoneIdsOfAddress(context, address, callback) {
    var logger = context.logger,
        zoneDao = daos.createDao('Zone', context);

    logger.debug('Getting zone ids of address %d', address.id);
    zoneDao.getZoneIdsByCountryIdAndStateId(
        address.country_id || 0,
        address.state_id || 0,
        callback
    );
}


/**
 * Get zone ids by country id and state id
 * @param context {Object} Request context.
 * @param countryId {Number} Country id.
 * @param stateId {Number} State id.
 * @param callback {Function} Callback function.
 */
function getZoneIdsByCountryIdAndStateId(context, countryId, stateId, callback) {
    var logger = context.logger,
        zoneDao = daos.createDao('Zone', context);

    logger.debug('Getting zone ids of {countryId: %d, stateId: %d}', countryId, stateId);
    zoneDao.getZoneIdsByCountryIdAndStateId(
        countryId || 0,
        stateId || 0,
        callback
    );
}


function getUserOfOrder(context, order, callback) {
    if (order.user) {
        callback(null, order.user);
        return;
    }

    var userDao = daos.createDao('User', context);
    userDao.getById(order.user_id, function (error, user) {
        if (error) {
            callback(error);
            return;
        }
        order.user = user;
        callback(null, user);
    });
}


/**
 * Get line items
 * @param items {Array} Items to buy. Array of object with id and quantity field.
 * @param callback {Function} Callback function.
 */
function getLineItems(context, user, items, callback) {
    var Variant = context.readModels.Variant,
        roleDao = daos.createDao('Role', context),
        userDao = daos.createDao('User', context),
        variantDao = daos.createDao('Variant', context),
        lineItems = [];

    async.waterfall([
        function (callback) {
            async.forEachSeries(items, function (eachItem, callback) {
                async.waterfall([
                    function (callback) {
                        if (eachItem.roleId) {
                            roleDao.getRoleById(eachItem.roleId, function (error, role) {
                                if (error) {
                                    callback(error);
                                    return;
                                }

                                if (!role) {
                                    error = new Error("Role with id '" + eachItem.roleId + "' does not exist.");
                                    error.errorCode = 'InvalidRoleId';
                                    error.statusCode = 400;
                                    callback(error);
                                    return;
                                }

                                eachItem.roleCode = role.role_code;
                                callback();
                            });
                            return;
                        }

                        if (!eachItem.roleCode) {
                            userDao.getRolesOfUser(user, function (error, roles) {
                                if (!roles.length) {
                                    error = new Error("User doesn't belong to any roles.");
                                    error.errorCode = 'NoPermissionToGetVariantDetail';
                                    error.statusCode = 403;
                                    callback(error);
                                    return;
                                }

                                eachItem.roleId = roles[0].id;
                                eachItem.roleCode = roles[0].role_code;
                                callback();
                            });

                            return;
                        }

                        roleDao.getRoleByCode(eachItem.roleCode, function (error, role) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            if (!role) {
                                error = new Error("Role with code '" + eachItem.roleCode + "' does not exist.");
                                error.errorCode = 'InvalidRoleCode';
                                error.statusCode = 400;
                                callback(error);
                                return;
                            }

                            eachItem.roleId = role.id;
                            callback();
                        });
                    },

                    function (callback) {
                        var getVariantDetailOptions = {
                            user : user,
                            variantId : eachItem.variantId,
                            roleId : eachItem.roleId,
                            catalogCode : eachItem.catalogCode
                        };
                        variantDao.getVariantDetailForUser(getVariantDetailOptions, callback);
                    },

                    function (variant, callback) {
                        var lineItem,
                            error;

                        if (!variant) {
                            error = new Error('Variant with id ' + eachItem.variantId + ' was not found.');
                            error.errorCode = 'InvalidVariantId';
                            error.statusCode = 400;
                            callback(error);
                            return;
                        }

                        lineItem = {
                            variant : variant,
                            variant_id : variant.id,
                            catalog_product_variant_id : variant.catalog_product_variant_id,
                            catalog_id : variant.catalog_id,
                            catalog_code : eachItem.catalogCode,
                            role_id : eachItem.roleId,
                            role_code : eachItem.roleCode,
                            product_id : variant.product_id,
                            product_name : variant.name,
                            sku : variant.sku,
                            images : variant.images,
                            price : variant.price,
                            retail_price : variant.price,
                            quantity : eachItem.quantity,
                            line_no : (lineItems.length + 1) * 10,
                            personalizedValues : eachItem.personalizedValues,

                            is_autoship : false
                        };

                        fillCommissionsVolumesToLineItem(context, lineItem, variant);

                        fillPersonalizedTypeNameToPersonalizedValues(context, lineItem.personalizedValues, lineItem.product_id, function (error) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            lineItems.push(lineItem);
                            callback();
                        });
                    }
                ], callback);
            }, function (err) {
                if (err) {
                    callback(err);
                    return;
                }

                callback(null, lineItems);
            });
        }
    ], callback);
}


function validateLineItemsForProductCountry(context, user, lineItems, callback) {
    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getCountryOfUser(user, callback);
        },

        function (country, callback) {
            var countryIdOfUser = country.id,
                productDao = daos.createDao('Product', context);

            async.forEachSeries(lineItems, function (lineItem, next) {
                productDao.canProductSellInCountry(lineItem.variant.product_id, countryIdOfUser, function (error, canSell) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!canSell) {
                        error = new Error("Product "+ ( lineItem.variant.name ||  lineItem.variant.product_id ) + " is not allowed to buy in your country.");
                        error.errorCode = 'InvalidLineItems';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    next();
                });
            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback();
            });
        }
    ], callback);
}


function getFirstRenewalItemFromLineItems(context, lineItems, done) {
    var productDao = daos.createDao('Product', context);

    async.forEachSeries(lineItems, function (lineItem, callback) {
        var variant = lineItem.variant;

        async.waterfall([
            function (callback) {
                isVariantInTaxonByNames(context, variant, ['Membership', 'System'], callback);
            },

            function (isInTaxon, callback) {
                if (isInTaxon) {
                    done(null, lineItem);
                    return;
                }

                callback();
            }
        ], callback);
    }, function (error) {
        done(error, null);
    });
}


function selectSystemKitLineItems(context, lineItems, callback) {
    var productDao = daos.createDao('Product', context),
        systemKits = [];

    async.forEachSeries(lineItems, function (lineItem, callback) {
        var variant = lineItem.variant;

        async.waterfall([
            function (callback) {
                productDao.getById(variant.product_id, callback);
            },

            function (product, callback) {
                productDao.isProductInTaxonByName(product, 'System', callback);
            },

            function (isInTaxon, callback) {
                if (isInTaxon) {
                    systemKits.push(lineItem);
                }

                callback();
            }
        ], callback);
    }, function (error) {
        if (error) {
            callback(error);
            return;
        }
        callback(null, systemKits);
    });
}


function validateLineItemsForSystemKit(context, user, lineItems, callback) {
    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.isDistributorRenewalDue(user, callback);
        },

        function (isDue, callback) {
            var productDao;

            selectSystemKitLineItems(context, lineItems, function (error, systemKits) {
                if (error) {
                    callback(error);
                    return;
                }

                // can only buy one system kit once.
                if (systemKits.length && (systemKits[0].quantity > 1 || systemKits.length > 1)) {
                    error = new Error("Can't buy more than one system kit.");
                    error.errorCode = 'InvalidLineItems';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                // must buy a system kit if due.
                if (isDue && !systemKits.length) {
                    error = new Error("Must buy a system kit.");
                    error.errorCode = 'InvalidLineItems';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        }
    ], callback);
}


function isVariantInTaxonByName(context, variant, taxonName, callback) {
    var productDao = daos.createDao('Product', context);

    async.waterfall([
        function (callback) {
            productDao.getById(variant.product_id, callback);
        },

        function (product, callback) {
            productDao.isProductInTaxonByName(product, taxonName, callback);
        }
    ], callback);
}

function isVariantInTaxonByNames(context, variant, taxonNames, callback) {
    var productDao = daos.createDao('Product', context);

    async.waterfall([
        function (callback) {
            productDao.getById(variant.product_id, callback);
        },

        function (product, callback) {
            productDao.isProductInTaxonByNames(product, taxonNames, callback);
        }
    ], callback);
}

function getProductsWhichIsVariantInTaxonByNames(options, callback) {
    var context = options.context;
    var lineItems = options.lineItems;
    var taxonNames = options.taxonNames;
    var productDao = daos.createDao('Product', context);
    var products = [];

    async.eachSeries(lineItems, function (lineItem, next) {
        async.waterfall([
            function (callback) {
                productDao.getById(lineItem.variant.product_id, callback);
            },

            function (product, callback) {
                productDao.isProductInTaxonByNames(product, taxonNames, function(error, isIn) {
                    callback(error, isIn, product);
                });
            },

            function (isIn, product, callback) {
                if(isIn === true) {
                    products.push(product);
                }
                callback(null, product);
            }
        ], next);
    }, function(error){
        callback(error, products);
    });
}


function isVariantInPromotionalTaxon(context, variant, callback) {
    var productDao = daos.createDao('Product', context);

    async.waterfall([
        function (callback) {
            productDao.getById(variant.product_id, callback);
        },

        function (product, callback) {
            var promotionalTaxonNames = [
                    'Starter Promo',
                    'Promo Pack'
                ];

            async.forEachSeries(promotionalTaxonNames, function (taxonName, next) {
                productDao.isProductInTaxonByName(product, taxonName, function (error, isPromotional) {
                    if (error) {
                        next(error);
                        return;
                    }

                    if (isPromotional) {
                        callback(null, true);
                        return;
                    }

                    next();
                });
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


function validateLineItemsForPromotional(context, user, lineItems, callback) {
    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getBoughtVariantIdsOfUser(user, callback);
        },

        function (boughtVariantIds, callback) {
            async.forEachSeries(lineItems, function (lineItem, callback) {
                async.waterfall([
                    function (callback) {
                        isVariantInPromotionalTaxon(context, lineItem.variant, callback);
                    },

                    function (isPromotional, callback) {
                        if (!isPromotional) {
                            callback();
                            return;
                        }

                        var error;

                        if (boughtVariantIds.indexOf(lineItem.variant_id) !== -1) {
                            error = new Error('Variant ' + lineItem.variant_id + ' is not valid.');
                            error.errorCode = 'InvalidLineItems';
                            error.statusCode = 400;
                            callback(error);
                            return;
                        }

                        if (lineItem.quantity > 1) {
                            error = new Error('Quantity of ariant ' + lineItem.variant_id + ' is over limit.');
                            error.errorCode = 'InvalidLineItems';
                            error.statusCode = 400;
                            callback(error);
                            return;
                        }
                        callback();
                    }
                ], callback);
            }, function (error) {
                callback(error);
            });
        }
    ], callback);
}


function isLineItemsContainProductInTaxonByName(context, lineItems, taxonName, callback) {
    async.forEachSeries(lineItems, function (lineItem, next) {
        isVariantInTaxonByName(context, lineItem.variant, taxonName, function (error, isInTaxon) {
            if (error) {
                callback(error);
                return;
            }

            if (isInTaxon) {
                callback(null, true);
                return;
            }

            next();
        });
    }, function (error) {
        callback(error, false);
    });
}


function isLineItemsContainProductInTaxonByNames(context, lineItems, taxonNames, callback) {
    async.forEachSeries(lineItems, function (lineItem, next) {
        isVariantInTaxonByNames(context, lineItem.variant, taxonNames, function (error, isInTaxon) {
            if (error) {
                callback(error);
                return;
            }

            if (isInTaxon) {
                callback(null, true);
                return;
            }

            next();
        });
    }, function (error) {
        callback(error, false);
    });
}

function addQuantityToProductInfo (options, callback) {
    var lineItems = options.lineItems;
    var productInfos = options.productInfos;

    productInfos.forEach(function (productInfo) {
        item = u.find(lineItems, function (lineItem) {
            return lineItem.product_id === productInfo.id;
        });
        if(!item) {
            var error = new Error('can not find product in lineItem.');
            error.statusCode = 400;
            callback(error);
            return;
        }
        productInfo.quantity = item.quantity;
    });
    callback(null, productInfos);
}

function getProductsWithPropertyByTaxonNames(options, callback) {
    var context = options.context;
    var lineItems = options.lineItems;
    var taxonNames = options.taxonNames;

    async.waterfall([
        function (callback) {
            getProductsWhichIsVariantInTaxonByNames({
                context: context,
                lineItems: lineItems,
                taxonNames: taxonNames
            }, callback);
        },

        function (products, callback) {
            var productDao = daos.createDao('Product', context);
            productDao.addPropertyInfoToProducts({products: products}, callback);
        },

        function (productInfos, callback) {
            addQuantityToProductInfo({
                lineItems: lineItems,
                productInfos: productInfos
            }, callback);
        }
    ], callback);

}

function isLineItemsContainPromotionalProduct(context, lineItems, callback) {
    async.forEachSeries(lineItems, function (lineItem, next) {
        isVariantInPromotionalTaxon(context, lineItem.variant, function (error, isPromotional) {
            if (error) {
                callback(error);
                return;
            }

            if (isPromotional) {
                callback(null, true);
                return;
            }

            next();
        });
    }, function (error) {
        callback(error, false);
    });
}


function isLineItemsContainProductInCatalogByCode(context, lineItems, catalogCode, callback) {
    async.forEachSeries(lineItems, function (lineItem, next) {
        var isInCatalog = lineItem.catalog_code == catalogCode;
        if (isInCatalog) {
            callback(null, true);
            return;
        }

        next();
    }, function (error) {
        callback(error, false);
    });
}



function validateLineItemsForTaxons(context, user, lineItems, callback) {
    // TODO: finish this
    callback();
}

function validateLineItemsForCountOnHand(context, user, lineItems, callback) {
    var lineItem,
        i,
        error;

    for (i = 0; i < lineItems.length; i += 1) {
        lineItem = lineItems[i];
        if (lineItem.variant.count_on_hand === -1) {
            error = new Error("'" + lineItem.product_name + "' is out of stock.");
            error.errorCode = 'InvalidLineItems';
            error.statusCode = 409;
            callback(error);
            return;
        }
    }

    callback();
}


function validateLineItemsForBebMiniMate(context, user, lineItems, callback) {
    if (context.companyCode !== 'BEB') {
        callback();
        return;
    }

    async.forEachSeries(lineItems, function (lineItem, callback) {
        if (lineItem.product_name.toLowerCase() === 'mini mate travel set' &&
                lineItem.catalog_code === 'RG' &&
                lineItem.quantity > 1) {
            var error = new Error("You can buy only one Mini Mate.");
            error.errorCode = 'InvalidLineItems';
            error.statusCode = 409;
            callback(error);
            return;
        }

        callback();
    }, function (error) {
        callback(error);
    });
}


function validateLineItems(context, user, lineItems, callback) {
    var i,
        len = lineItems.length,
        lineItem,
        error;

    for (i = 0; i < len; i += 1) {
        lineItem = lineItems[i];

        if (!lineItem.quantity) {
            error = new Error('Quantity of variant ' + lineItem.variant_id + ' is invalid.');
            error.errorCode = 'InvalidLineItems';
            error.statusCode = 400;
            callback(error);
            return;
        }

        if (!lineItem.variant || lineItem.variant.deleted_at) {
            error = new Error('Variant ' + lineItem.variant_id + ' was not found.');
            error.errorCode = 'InvalidLineItems';
            error.statusCode = 400;
            callback(error);
            return;
        }
    }

    async.waterfall([
        validateLineItemsForProductCountry.bind(this, context, user, lineItems),
        validateLineItemsForTaxons.bind(this, context, user, lineItems),
        validateLineItemsForCountOnHand.bind(this, context, user, lineItems),
        validateLineItemsForBebMiniMate.bind(this, context, user, lineItems),
        //validateLineItemsForSystemKit.bind(this, context, user, lineItems),
        //validateLineItemsForPromotional.bind(this, context, user, lineItems)
    ], callback);
}


function roundMoney(money) {
    return Math.round(money * 100) / 100;
}


function getTotalPriceOfLineItems(lineItems, callback) {
    var totalPrice = 0;

    lineItems.forEach(function (eachLineItem) {
        totalPrice = roundMoney(totalPrice + eachLineItem.price * eachLineItem.quantity);
    });

    return totalPrice;
}


function savePersonalizedValues(context, personalizedValues, lineItemId, callback) {
    var logger = context.logger,
        newPersonalizedValues = [];

    logger.debug("saving personalized values for line item %d", lineItemId);
    async.forEachSeries(personalizedValues, function (personalizedValue, callback) {
        var now = new Date(),
            queryDatabaseOptions = {
                useWriteDatabase : true,
                sqlStmt : "INSERT INTO line_items_personalized_values (personalized_type_id, line_item_id, personalized_value, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
                sqlParams : [personalizedValue.id, lineItemId, personalizedValue.value, now, now]
            };

        DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
            if (error) {
                callback(error);
                return;
            }

            newPersonalizedValues.push({
                id : personalizedValue.id,
                name : personalizedValue.name,
                value : personalizedValue.value
            });
            callback();
        });
    }, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, newPersonalizedValues);
    });
}


function saveLineItem(context, lineItem, callback) {
    var lineItemModel = context.models.LineItem,
        newLineItem;

    async.waterfall([
        function (callback) {
            lineItemModel.create(lineItem).success(function (result) {
                newLineItem = result;
                newLineItem.variant = lineItem.variant;
                callback();
            }).error(callback);
        },

        function (callback) {
            if (!lineItem.personalizedValues || !lineItem.personalizedValues.length) {
                callback();
                return;
            }

            savePersonalizedValues(context, lineItem.personalizedValues, newLineItem.id, function (error, newPersonalizedValues) {
                if (error) {
                    callback(error);
                    return;
                }

                newLineItem.personalizedValues = newPersonalizedValues;
                callback();
            });
        },

        function (callback) {
            callback(null, newLineItem);
        }
    ], callback);
}


function saveLineItems(context, order, lineItems, callback) {
    var newLineItems = [];

    async.forEachSeries(lineItems, function (lineItem, callback) {
        lineItem.order_id = order.id;
        saveLineItem(context, lineItem, function (error, newLineItem) {
            if (error) {
                callback(error);
                return;
            }

            newLineItems.push(newLineItem);
            callback();
        });
    }, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, newLineItems);
    });
}


function getLineItemsOfOrder(context, order, callback) {
    if (order.lineItems) {
        callback(null, order.lineItems);
        return;
    }

    var logger = context.logger,
        user;

    async.waterfall([
        function (callback) {
            getUserOfOrder(context, order, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                user = result;
                callback();
            });
        },

        function (next) {
            // Get line items
            logger.debug('Getting line items of order %d', order.id);
            context.readModels.LineItem.findAll({
                where : {order_id : order.id}
            }).success(function (lineItems) {
                logger.debug('%d line items of order %d found', lineItems.length, order.id);

                if (!lineItems.length) {
                    callback(null, []);
                    return;
                }

                next(null, lineItems);
            }).error(callback);
        },

        function (items, callback) {
            var variantDao = daos.createDao('Variant', context),
                roleDao = daos.createDao('Role', context),
                lineItems = [];

            async.forEachSeries(items, function (eachItem, callback) {
                async.waterfall([
                    function (callback) {
                        roleDao.getRoleById(eachItem.role_id, function (error, role) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            if (!role) {
                                error = new Error("Role with id '" + eachItem.role_id + "' does not exist.");
                                error.errorCode = 'InvalidRoleId';
                                error.statusCode = 400;
                                callback(error);
                                return;
                            }

                            eachItem.role_code = role.role_code;
                            callback();
                        });
                    },

                    function (callback) {
                        var getVariantDetailOptions = {
                            allowDeletedVariant : true,
                            variantId : eachItem.variant_id
                        };
                        variantDao.getVariantDetail(getVariantDetailOptions, callback);
                    },

                    function (variant, next) {
                        var lineItem,
                            error;

                        if (!variant) {
                            error = new Error('Variant with id ' + eachItem.variant_id + ' was not found.');
                            error.errorCode = 'InvalidVariantId';
                            error.statusCode = 400;
                            callback(error);
                            return;
                        }

                        lineItem = {
                            id : eachItem.id,
                            variant : variant,
                            variant_id : variant.id,
                            catalog_product_variant_id : eachItem.catalog_product_variant_id,
                            catalog_code : eachItem.catalog_code,
                            role_id : eachItem.role_id,
                            role_code : eachItem.role_code,
                            product_id : variant.product_id,
                            product_name : variant.name,
                            sku : variant.sku,
                            images : variant.images,
                            price : eachItem.price,
                            retail_price : eachItem.retail_price,
                            quantity : eachItem.quantity,
                            line_no : eachItem.line_no,

							dt_volume : eachItem.dt_volume,
							ft_volume : eachItem.ft_volume,
                            u_volume : eachItem.u_volume,
                            q_volume : eachItem.q_volume,
                            r_volume : eachItem.r_volume,

                            is_autoship : eachItem.is_autoship,
                            adj_qv : eachItem.adj_qv
                        };

                        lineItems.push(lineItem);

                        next();
                    }
                ], callback);
            }, function (err) {
                if (err) {
                    callback(err);
                    return;
                }

                order.lineItems = lineItems;
                callback();
            });
        },

        function (callback) {
            fillPersonalizedValuesToLineItems(context, order.lineItems, callback);
        },

        function (callback) {
            callback(null, order.lineItems);
        }
    ], callback);
}


function fillShippedAndReturnedQuantityOfLineItems(context, order, lineItems, callback) {
    var logger = context.logger;

    logger.debug('filling shipped quantity and returned quantity of line items.');
    async.waterfall([
        function (callback) {
            var inventoryUnitDao = daos.createDao('InventoryUnit', context);
            inventoryUnitDao.getInventoryUnitsByOrderId(order.id, callback);
        },

        function (inventoryUnits, callback) {
            lineItems.forEach(function (lineItem) {
                lineItem.shippedQuantity = 0;
                lineItem.returnedQuantity = 0;

                inventoryUnits.forEach(function (inventoryUnit) {
                    if (inventoryUnit.state === 'shipped') {
                        lineItem.shippedQuantity += 1;
                    } else if (inventoryUnit.state === 'returned') {
                        lineItem.returnedQuantity += 1;
                    }
                });
            });

            callback();
        }
    ], callback);
}


function generateOrderNumber(order, prefix) {
    var number = '',
        orderId = order.id.toString(),
        lengthOfId = 11;

    u.times(lengthOfId - orderId.length, function () {
        number += '0';
    });

    if (!prefix) {
        prefix = '';
    }

    return prefix + number + orderId;
}

function updateOrderNumber(order, prefix, callback) {
    order.number = generateOrderNumber(order, prefix);
    order.save(['number']).success(function () {
        callback();
    }).error(callback);
}

function updateRegularOrderNumber(context, order, callback) {
    var prefix = 'Z';

    if (context.clientId) {
        prefix = context.clientId.substr(0, 1).toUpperCase();
    }
    updateOrderNumber(order, prefix, callback);
}

function updateAutoshipOrderNumber(context, order, callback) {
    var prefix = 'A';
    updateOrderNumber(order, prefix, callback);
}


function saveEventOrderRelation(context, eventCode, orderNumber, callback) {
    var queryDatabaseOptions = {
            sqlStmt : "INSERT INTO events_orders (event_code, order_number, created_at, updated_at) VALUES ($1, $2, now(), now())",
            sqlParams : [eventCode, orderNumber]
        };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
        callback(error);
    });
}


function getDistributorOfOrder(context, order, callback) {
    async.waterfall([
        function (callback) {
            getUserOfOrder(context, order, callback);
        },

        function (user, callback) {
            var userDao = daos.createDao('User', context);
            userDao.getDistributorOfUser(user, callback);
        }
    ], callback);
}


function getShippingZoneIdsOfOrder(context, order, callback) {
    if (order.shippingZoneIds) {
        callback(null, order.shippingZoneIds);
        return;
    }

    async.waterfall([
        function (callback) {
            getZoneIdsOfAddress(context, order.shippingAddress, callback);
        },

        function (zoneIds, callback) {
            order.shippingZoneIds = zoneIds;
            callback(null, zoneIds);
        }
    ], callback);
}


function getWarehouseOfOrder(context, order, callback) {
    if (order.warehouse) {
        callback(null, order.warehouse);
        return;
    }

    async.waterfall([
        function (callback) {
            getShippingZoneIdsOfOrder(context, order, callback);
        },

        function (shippingZoneIds, callback) {
            var warehouseDao = daos.createDao('Warehouse', context);
            warehouseDao.getWarehousesInZones(order.shippingZoneIds, callback);
        },

        function (warehouses, callback) {
            if (warehouses && warehouses.length !== 0) {
                order.warehouse = warehouses[0];
            }
            callback(null, order.warehouse);
        }
    ], callback);
}

function saveShippingAddressForOrder(context, order, addressData, callback) {
    var logger = context.logger,
        orderUser = null;

    logger.debug("Saving shipping address for order.");
    async.waterfall([
        function (callback) {
            getUserOfOrder(context, order, callback);
        },

        function (user, callback) {
            orderUser = user;
            var userDao = daos.createDao('User', context);
            userDao.getShippingAddressOfUser(user, callback);
        },

        function (shippingAddressOfUser, next) {
            var addressDao = daos.createDao('Address', context);

            if (shippingAddressOfUser && addressDao.isAddressEquals(shippingAddressOfUser, addressData)) {
                callback(null, shippingAddressOfUser);
                return;
            }

            // addressDao.createShippingAddress(addressData, next);
            addressDao.createUserShippingAddress(orderUser, addressData, next);
        },

        function (address, next){
            var usersShipAddressDao = daos.createDao('UsersShipAddress', context);
            usersShipAddressDao.saveUserShipAddress(orderUser, address, true, false, function(error, userShipAddress){
                next(error, address);
            });
        }
    ], callback);
}

function saveBillingAddressForOrder(context, order, addressData, callback) {
    var logger = context.logger;

    logger.debug("Saving billing address for order.");
    async.waterfall([
        function (callback) {
            getUserOfOrder(context, order, callback);
        },

        function (user, callback) {
            var userDao = daos.createDao('User', context);
            userDao.getBillingAddressOfUser(user, callback);
        },

        function (billingAddressOfUser, next) {
            var addressDao = daos.createDao('Address', context);

            if (billingAddressOfUser && addressDao.isAddressEquals(billingAddressOfUser, addressData)) {
                callback(null, billingAddressOfUser);
                return;
            }

            addressDao.createBillingAddress(addressData, next);
        }
    ], callback);
}


function getShippingMethodOfOrder(context, order, callback) {
    if (!order.shipping_method_id) {
        callback(null, null);
        return;
    }

    if (order.shippingMethod) {
        callback(null, order.shippingMethod);
        return;
    }

    var shippingMethodDao = daos.createDao('ShippingMethod', context);
    shippingMethodDao.getShippingMethodById(order.shipping_method_id, function (error, shippingMethod) {
        if (error) {
            callback(error);
            return;
        }

        order.shippingMethod = shippingMethod;
        callback(null, shippingMethod);
    });
}


function getAvailableShippingMethodsOfOrder(context, order, callback) {
    var logger = context.logger;

    logger.debug('Getting available shipping methods of order %d', order.id);
    async.waterfall([
        function (callback) {
            // get shipping address of order
            if (order.shippingAddress) {
                callback();
                return;
            }

            logger.debug('Getting shipping address of order %d', order.id);
            var addressDao = daos.createDao('Address', context);
            addressDao.getById(order.ship_address_id, function (error, address) {
                if (error) {
                    callback(error);
                    return;
                }

                order.shippingAddress = address;
                callback();
            });
        },

        function (callback) {
            // Get available shipping zone ids
            if (order.shippingZoneIds) {
                callback();
                return;
            }

            logger.debug('Getting available shipping zone ids of order %d', order.id);
            getZoneIdsOfAddress(context, order.shippingAddress, function (error, zoneIds) {
                if (error) {
                    callback(error);
                    return;
                }

                logger.debug('order.shippingZoneIds: %s', zoneIds);
                order.shippingZoneIds = zoneIds;
                callback();
            });
        },

        function (callback) {
            var shippingMethodDao = daos.createDao('ShippingMethod', context);
            shippingMethodDao.getShippingMethodsInZones(order.shippingZoneIds, callback);
        }

    ], callback);
}


function selectDefaultShippingMethod(shippingMethods) {
    if (!shippingMethods || !shippingMethods.length) {
        return null;
    }

    var nonPickupMethod,
        defaultShippingMethod;

    defaultShippingMethod = u.find(shippingMethods, function (shippingMethod) {
        return shippingMethod.is_default;
    });

    nonPickupMethod = u.find(shippingMethods, function (shippingMethod) {
        return shippingMethod.shippingAddressChangeable;
    });

    return defaultShippingMethod || nonPickupMethod || shippingMethods[0];
}


function isAvailablePickupShippingMethodToOrder(context, order, shippingMethod, callback) {
    if (!shippingMethod.shippingAddresses || !shippingMethod.shippingAddresses.length) {
        callback(null, false);
        return;
    }

    async.waterfall([
        function (callback) {
            getUserOfOrder(context, order, callback);
        },

        function (user, callback) {
            var userDao = daos.createDao('User', context);
            userDao.getSoldAddressOfUser(user, callback);
        },

        function (soldAddress, callback) {
            var countryshipDao = daos.createDao('Countryship', context);
            countryshipDao.getCountryIdsCanShipTo(soldAddress.country_id, callback);
        },

        function (countryIds, callback) {
            var shippingAddress,
                len = shippingMethod.shippingAddresses.length,
                i;

            for (i = 0; i < len; i += 1) {
                shippingAddress = shippingMethod.shippingAddresses[i];

                if (countryIds.indexOf(shippingAddress.country_id) !== -1) {
                    callback(null, true);
                    return;
                }
            }
            callback(null, false);
        }
    ], callback);
}


function isShippingMethodAvailableToOrder(context, order, shippingMethod, callback) {
    if (!shippingMethod.shippingAddressChangeable) {
        isAvailablePickupShippingMethodToOrder(context, order, shippingMethod, callback);
        return;
    }

    async.waterfall([
        function (callback) {
            getAvailableShippingMethodsOfOrder(context, order, callback);
        },

        function (availableShippingMethods, callback) {
            var availableShippingMethod,
                i;

            for (i = 0; i < availableShippingMethods.length; i += 1) {
                availableShippingMethod = availableShippingMethods[i];
                if (availableShippingMethod.id === shippingMethod.id) {
                    callback(null, true);
                    return;
                }
            }
            callback(null, false);
        }
    ], callback);
}


function isTaxFree(context, order, callback) {
    var countryDao = daos.createDao('Country', context),
        freeTaxISOes,
        countryOfShippingAddress;

    async.waterfall([
        function (callback) {
            countryDao.getFreeTaxISOes(callback);
        },

        function (result, callback) {
            freeTaxISOes = result;
            countryDao.getCountryById(order.shippingAddress.country_id, callback);
        },

        function (result, next) {
            countryOfShippingAddress = result;

            if (!u.contains(freeTaxISOes, countryOfShippingAddress.iso)) {
                callback(null, false);
                return;
            }

            getDistributorOfOrder(context, order, next);
        },

        function (distributorOfOrderUser, callback) {
            callback(null, !!distributorOfOrderUser.taxnumber_exemption);
        }
    ], callback);
}


function shouldUseAvalara(context, order, callback) {
    if (!context.config.avalara || !context.config.avalara.enabled) {
        callback(null, false);
        return;
    }

    var addressDao = daos.createDao('Address', context);

    async.waterfall([
        function (callback) {
            addressDao.getCountryOfAddress(order.shippingAddress, callback);
        },

        function (country, next) {
            if (country.iso !== 'US') {
                callback(null, false);
                return;
            }

            addressDao.getStateOfAddress(order.shippingAddress, next);
        },

        function (state, callback) {
            var stateName = state.name;

            if (stateName !== 'American Samoa' &&
                    stateName !== 'Northern Mariana Islands' &&
                    stateName !== 'Puerto Rico' &&
                    stateName !== 'United States Minor Outlying Islands' &&
                    stateName !== 'Guam') {
                callback(null, true);
                return;
            }

            callback(null, false);
        }
    ], callback);
}


function parseGetTaxAndShippingAmountResult(str) {
    var adjustmentStringArray,
        result = {
            shipping : null,
            taxes : []
        };

    if (!str) {
        return result;
    }


    try {
        adjustmentStringArray = JSON.parse('[' + str.substr(1, str.length - 2) + ']');
    } catch (ex) {
        return null;
    }

    adjustmentStringArray.forEach(function (str) {
        if (!str) {
            return;
        }

        var adjustmentData,
            name,
            prefix,
            originatorId,
            amount;

        try {
            adjustmentData = str.substr(1, str.length - 2).split(',');

            name = adjustmentData[0];
            // remove the quote wrap
            if (name.substr(0, 1) === '"') {
                name = name.substr(1);
            }
            if (name.substr(name.length - 1) === '"') {
                name = name.substr(0, name.length - 1);
            }

            originatorId = parseInt(adjustmentData[1], 10);
            amount = parseFloat(adjustmentData[2]);
            prefix = name.substr(0, 2);

            if (prefix === 's:') {
                result.shipping = {
                    source_type : 'Shipment',
                    originator_type : 'ShippingMethod',
                    originator_id : originatorId,
                    label : 'Shipping',
                    amount : amount
                };
            } else if (prefix === 't:') {
                result.taxes.push({
                    source_type : 'Order',
                    originator_type : 'TaxRate',
                    originator_id : originatorId,
                    label : name.substr(2),
                    amount : amount
                });
            }
        } catch (ex) {
            return;
        }
    });

    return result;
}


function calculateAdjustmentsOfOrderViaCalculator(context, order, callback) {
    var logger = context.logger,
        roldIdOfDistributor = 2,
        sql;

    sql = "SELECT get_order_tax_and_shipping_adjustments(";
    sql += "array[" + order.shippingAddress.state_id + ", " + order.shippingAddress.country_id + ", " + order.shipping_method_id + ", " + roldIdOfDistributor + "]::int[], ";
    sql += "array[";

    sql += order.lineItems.map(function (lineItem) {
        return "row(" + lineItem.variant_id + ", " + lineItem.quantity + ", " + lineItem.price + ")";
    }).join(",");

    sql += "]::order_items[]);";

    logger.debug("Calculating tax and shipping adjustments of order %d via calculator...", order.id);
    logger.debug(sql);

    context.readDatabaseClient.query(sql, [], function (error, queryResult) {
        if (error) {
            logger.error("Calculate tax and shipping adjustments error: %s", error.message);
            callback(error);
            return;
        }

        if (!queryResult.rows || !queryResult.rows.length) {
            callback(null, {
                shipping : null,
                taxes : []
            });
            return;
        }

        logger.debug(queryResult.rows[0].get_order_tax_and_shipping_adjustments);
        var amounts = parseGetTaxAndShippingAmountResult(queryResult.rows[0].get_order_tax_and_shipping_adjustments);
        if (!amounts) {
            error = new Error("Can't calculate tax and shipping amount.");
            callback(error);
            return;
        }

        callback(null, amounts);
    });
}


function calculateShippingCostOfOrder(context, order, callback) {
    var logger = context.logger;

    logger.debug("calculating shipping cost of order %d", order.id);
    async.waterfall([
        function (callback) {
            var calculatorDao = daos.createDao('Calculator', context);
            calculatorDao.getCalculatorsOfCalculableObject('ShippingMethod', order.shipping_method_id, callback);
        },

        function (shippingCostCalculators, callback) {
            if (!shippingCostCalculators.length) {
                logger.error("Can not calculate shipping cost of order %d: Calculator with calculable_type='%s' and calculable_id=%d does not exist.", order.id, 'ShippingMethod', order.shipping_method_id);
                var error = new Error("Can not calculate shipping cost.");
                callback(error);
                return;
            }

            var totalAmount = 0;
            async.forEachSeries(shippingCostCalculators, function (calculator, callback) {
                calculators.compute(context, order, calculator.id, calculator.type, function (error, shippingCost) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    totalAmount += shippingCost;
                    callback();
                });
            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, totalAmount);
            });
        },

        function (amount, callback) {
            if (context.companyCode !== 'FTO') {
                callback(null, amount);
                return;
            }

            if (!amount) {
                amount = 0;
            }

            var containsProduct398 = false;
            order.lineItems.forEach(function (lineItem) {
                if (lineItem.product_id === 398) {
                    containsProduct398 = true;
                }
            });

            if (containsProduct398) {
                amount += 12;
            }

            callback(null, amount);
        },

        function (amount, callback) {
            callback(null, roundMoney(amount));
        }
    ], callback);
}


function calculateSalesTaxAdjustments(context, zoneIds, lineItems, callback) {
    var logger = context.logger,
        taxRateDao = daos.createDao('TaxRate', context),
        taxCategoryDao = daos.createDao('TaxCategory', context),
        taxRatesMapByTaxCategoryId = {},
        taxAdjustmentsMapByCategoryName = {};

    logger.debug("calculating sales tax adjustments");

    async.waterfall([
        function (callback) {
            taxRateDao.getTaxRatesInZones(zoneIds, function (error, taxRates) {
                if (error) {
                    callback(error);
                    return;
                }

                taxRates.forEach(function (taxRate) {
                    taxRatesMapByTaxCategoryId[taxRate.tax_category_id] = taxRate;
                });

                callback();
            });
        },

        function (callback) {
            async.forEachSeries(lineItems, function (eachLineItem, callback) {
                var taxCategoryId = eachLineItem.variant.tax_category_id,
                    taxCategory,
                    taxRate = taxRatesMapByTaxCategoryId[taxCategoryId];

                if (!taxRate) {
                    callback();
                    return;
                }

                async.waterfall([
                    function (callback) {
                        taxCategoryDao.getTaxCategoryById(taxCategoryId, function (error, result) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            taxCategory = result;
                            callback();
                        });
                    },

                    function (callback) {
                        var taxAmountOfLineItem = roundMoney((eachLineItem.price * eachLineItem.quantity) * taxRate.amount),
                            taxAdjustmentOfCategory = taxAdjustmentsMapByCategoryName[taxCategory.name];

                        if (!taxAdjustmentOfCategory) {
                            taxAdjustmentsMapByCategoryName[taxCategory.name] = taxAdjustmentOfCategory = {
                                source_type : 'Order',
                                originator_type : 'TaxRate',
                                originator_id : taxRate.id,
                                label : taxCategory.name,
                                amount : 0
                            };
                        }

                        taxAdjustmentOfCategory.amount = roundMoney(taxAdjustmentOfCategory.amount + taxAmountOfLineItem);

                        logger.debug("tax amount of line item %d is %s (lineItem.price = %s, lineItem.quantity = %s, taxCategory.name = %s, taxRate.id = %d, taxRate.amount = %s)",
                                eachLineItem.line_no,
                                taxAmountOfLineItem,
                                eachLineItem.price,
                                eachLineItem.quantity,
                                taxCategory.name,
                                taxRate.id,
                                taxRate.amount);

                        callback();
                    }
                ], callback);
            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                var taxAdjustments = [],
                    taxAdjustment,
                    key;

                for (key in taxAdjustmentsMapByCategoryName) {
                    if (taxAdjustmentsMapByCategoryName.hasOwnProperty(key)) {
                        taxAdjustment = taxAdjustmentsMapByCategoryName[key];
                        taxAdjustments.push(taxAdjustment);
                    }
                }

                callback(null, taxAdjustments);
            });
        }
    ], callback);
}

function calculateShippingTaxAdjustments(context, zoneIds, shippingCost, callback) {
    var logger = context.logger,
        taxRateDao = daos.createDao('TaxRate', context),
        taxCategoryDao = daos.createDao('TaxCategory', context),
        taxAdjustmentsMapByCategoryName;

    async.waterfall([
        function (callback) {
            taxRateDao.getTaxRatesInZones(zoneIds, callback);
        },

        function (taxRates, callback) {
            async.forEachSeries(taxRates, function (taxRate, callback) {
                taxCategoryDao.getTaxCategoryById(taxRate.tax_category_id, function (error, taxCategory) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (taxCategory.name.indexOf('shipping') === -1) {
                        callback();
                        return;
                    }

                    var taxAmountOfShipping = roundMoney(shippingCost * taxRate.amount),
                        taxAdjustmentOfCategory = taxAdjustmentsMapByCategoryName[taxCategory.name];

                    if (!taxAdjustmentOfCategory) {
                        taxAdjustmentsMapByCategoryName[taxCategory.name] = taxAdjustmentOfCategory = {
                            source_type : 'Order',
                            originator_type : 'TaxRate',
                            originator_id : taxRate.id,
                            label : taxCategory.name,
                            amount : 0
                        };
                    }

                    taxAdjustmentOfCategory.amount = roundMoney(taxAdjustmentOfCategory + taxAmountOfShipping);

                    logger.debug("tax amount of shipping cost is %s (shippingCost = %s, taxCategory.name = %s, taxRate.id = %d, taxRate.amount = %s)",
                            shippingCost,
                            taxCategory.name,
                            taxRate.id,
                            taxRate.amount);

                    callback();
                });

            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                var taxAdjustments = [],
                    taxAdjustment,
                    key;

                for (key in taxAdjustmentsMapByCategoryName) {
                    if (taxAdjustmentsMapByCategoryName.hasOwnProperty(key)) {
                        taxAdjustment = taxAdjustmentsMapByCategoryName[key];
                        taxAdjustments.push(taxAdjustment);
                    }
                }

                callback(null, taxAdjustments);
            });
        }
    ], callback);
}

function calculateTaxAdjustmentsOfOrder(context, order, shippingCost, callback) {
    var logger = context.logger,
        zoneId,
        adjustments = [];

    logger.debug("calculating tax amounts of order %d", order.id);
    async.waterfall([
        function (callback) {
            if (!order.shippingZoneIds || !order.shippingZoneIds.length) {
                var error = new Error("Can't calculate tax amounts. Unable to get zones of shipping address.");
                callback(error);
                return;
            }

            logger.debug("shipping zone ids is %s", order.shippingZoneIds);
            callback();
        },

        function (callback) {
            calculateSalesTaxAdjustments(context, order.shippingZoneIds, order.lineItems, function (error, salesTaxAdjustments) {
                if (error) {
                    callback(error);
                    return;
                }

                adjustments = adjustments.concat(salesTaxAdjustments);
                callback();
            });
        },

        function (callback) {
            if (!shippingCost) {
                callback();
                return;
            }

            calculateShippingTaxAdjustments(context, order.shippingZoneIds, shippingCost, function (error, shippingTaxAdjustments) {
                if (error) {
                    callback(error);
                    return;
                }

                adjustments = adjustments.concat(shippingTaxAdjustments);
                callback();
            });
        },

        function (callback) {
            callback(null, adjustments);
        }
    ], callback);
}


function calculateOrderTotal(itemTotal, adjustments) {
    var adjustmentTotal = 0,
        total;

    adjustments.forEach(function (eachAdjustment) {
        adjustmentTotal = roundMoney(adjustmentTotal + eachAdjustment.amount);
    });
    total = roundMoney(itemTotal + adjustmentTotal);

    return {
        total : total,
        adjustmentTotal : adjustmentTotal
    };
}


function flattenGroupedOrderAdjustments(groupedAdjustments) {
    if (!groupedAdjustments) {
        return [];
    }

    var adjustments = [];

    Object.keys(groupedAdjustments).forEach(function (key) {
        if (groupedAdjustments.hasOwnProperty(key)) {
            var item = groupedAdjustments[key];
            if (u.isArray(item)) {
                adjustments = adjustments.concat(item);
            } else if (u.isObject(item)) {
                adjustments.push(item);
            }
        }
    });

    return adjustments;
}


function sumAdjustmentsAmount(adjustments) {
    var adjustmentTotal = 0;
    adjustments.forEach(function (eachAdjustment) {
        adjustmentTotal = roundMoney(adjustmentTotal + eachAdjustment.amount);
    });
    return adjustmentTotal;
}


function refreshOrderTotalAndAdjustmentTotal(order) {
    var adjustmentTotal = 0,
        adjustments;

    if (order.groupedAdjustments) {
        adjustments = flattenGroupedOrderAdjustments(order.groupedAdjustments);
    } else {
        adjustments = order.adjustments;
    }

    adjustmentTotal = sumAdjustmentsAmount(adjustments);
    order.adjustment_total = adjustmentTotal;
    order.total = roundMoney(order.item_total + order.adjustment_total);

    if (order.total < 0) {
        order.total = 0;
    }
}

function calculateShippingAndTaxAdjustmentsOfOrder(context, order, callback) {
    var logger = context.logger,
        shippingCost,
        result = {
            shipping : null,
            taxes : []
        };

    logger.debug("calculating adjustments of order %d", order.id);
    async.waterfall([
        function (callback) {
            if (order.isNoShipping) {
                shippingCost = 0;
                callback();
                return;
            }

            calculateShippingCostOfOrder(context, order, function (error, amount) {
                if (error) {
                    callback(error);
                    return;
                }

                shippingCost = amount;

                logger.debug("shipping cost of order %d is %s", order.id, shippingCost);
                result.shipping = {
                    order_id : order.id,
                    source_type : 'Shipment',
                    originator_type : 'ShippingMethod',
                    originator_id : order.shipping_method_id,
                    label : 'Shipping',
                    amount : shippingCost
                };

                order.adjustments = [result.shipping];
                callback();
            });
        },

        function (next) {
            isTaxFree(context, order, function (error, isFree) {
                if (error) {
                    callback(error);
                    return;
                }

                logger.debug("adjustments of order %d: %j", order.id, result);
                if (isFree) {
                    result.taxes = [];
                    callback(null, result);
                    return;
                }
                next();
            });
        },

        function (next) {
            shouldUseAvalara(context, order, function (error, useAvalara) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!useAvalara) {
                    calculateTaxAdjustmentsOfOrder(context, order, shippingCost, function (error, adjustments) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        result.taxes = adjustments;
                        callback(null, result);
                    });
                    return;
                }

                next();
            });
        },

        function (callback) {
            avalara.getTaxAmountsOfOrder(context, order, function (error, amounts) {
                if (error) {
                    callback(error);
                    return;
                }

                result.useAvalara = true;
                result.lineItemTaxHash = amounts.lineItemTaxHash;
                result.taxes = [];
                result.taxes.push({
                    label : 'sales_tax',
                    amount : amounts.totalItemTaxAmount
                });
                result.taxes.push({
                    label : 'shipping_tax',
                    amount : amounts.shippingTaxAmount
                });

                logger.debug("adjustments of order %d: %j", order.id, result);
                callback(null, result);
            });
        }
    ], callback);
}


function calculateAdjustmentsOfOrder(context, operation, operationOptions, order, callback) {
    var groupedAdjustments;

    async.waterfall([
        function (callback) {
            calculateShippingAndTaxAdjustmentsOfOrder(context, order, callback);
        },

        function (result, callback) {
            groupedAdjustments = result;
            order.groupedAdjustments = groupedAdjustments;
            callback();
        },

        function (callback) {
            var additionalAdjustments = operationOptions.additionalAdjustments;
            if (!additionalAdjustments || !additionalAdjustments.length) {
                callback();
                return;
            }

            if (operation === 'checkoutOrder' && !order.autoship) {
                callback();
                return;
            }

            if (operation === 'createOrder' && !order.isAdmin) {
                callback();
                return;
            }

            order.groupedAdjustments.additional = [];
            additionalAdjustments.forEach(function (additionalAdjustment) {
                order.groupedAdjustments.additional.push({
                    order_id : order.id,
                    amount : additionalAdjustment.amount,
                    label : additionalAdjustment.label,
                    source_type : 'Order',
                    source_id : order.id
                });
            });

            callback();
        },

        function (callback) {
            refreshOrderTotalAndAdjustmentTotal(order);

            fireOrderEvent(context, operation, 'onCalculateAdjustments', operationOptions, order, callback);
        },

        function (callback) {
            callback(null, groupedAdjustments);
        }
    ], callback);
}


function updateShipmentsAndAdjustmentsOfOrder(context, order, callback) {
    var adjustmentDao,
        shipmentDao,
        adjustment,
        shipment,
        shippingAndTaxAdjustments = order.shippingAndTaxAdjustments,
        shippingAdjustment = shippingAndTaxAdjustments.shipping,
        taxAdjustments = shippingAndTaxAdjustments.taxes,
        discountAdjustment = shippingAndTaxAdjustments.discount,
        lineItemTaxHash = shippingAndTaxAdjustments.lineItemTaxHash;

    order.adjustments = [];

    async.waterfall([
        function (callback) {
            adjustmentDao = daos.createDao('Adjustment', context);
            adjustmentDao.clearAdjustmentsByOrderId(order.id, callback);
        },

        function (callback) {
            if (order.isNoShipping) {
                callback();
                return;
            }

            shipmentDao = daos.createDao('Shipment', context);
            shipmentDao.clearShipmentsByOrderId(order.id, callback);
        },

        // Save shipment of order
        function (callback) {
            if (order.isNoShipping) {
                callback();
                return;
            }

            shipment = {
                cost : (shippingAdjustment && shippingAdjustment.amount) || 0,
                shipping_method_id : order.shipping_method_id,
                address_id : order.ship_address_id
            };

            // set warehouse_id of shipment
            getWarehouseOfOrder(context, order, function (error, warehouse) {
                if (error) {
                    callback(error);
                    return;
                }

                if (warehouse) {
                    shipment.warehouse_id = warehouse.id;
                }

                // save shipment record
                shipmentDao.createShipment(order, shipment, function (error, newShipment) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    shipment = newShipment;
                    callback();
                });
            });
        },

        // Save adjustment for shipment
        function (callback) {
            if (order.isNoShipping) {
                callback();
                return;
            }

            adjustment = {
                order_id : order.id,
                amount : shipment.cost,
                label : 'Shipping',
                source_type : 'Shipment',
                source_id : shipment.id,
                mandatory : true,
                originator_type : 'ShippingMethod',
                originator_id : order.shipping_method_id
            };

            adjustmentDao.createAdjustment(adjustment, function (error, newAdjustment) {
                if (error) {
                    callback(error);
                    return;
                }

                order.adjustments.push(newAdjustment);
                callback();
            });
        },

        // Save adjustments for taxes
        function (callback) {
            async.forEachSeries(taxAdjustments, function (taxAdjustment, callback) {
                adjustment = {
                    order_id : order.id,
                    source_type : 'Order',
                    source_id : order.id,
                    mandatory : true,
                    originator_type : 'TaxRate',
                    originator_id : taxAdjustment.originator_id,
                    label: taxAdjustment.label,
                    amount : taxAdjustment.amount
                };

                adjustmentDao.createAdjustment(adjustment, function (error, newAdjustment) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    order.adjustments.push(newAdjustment);
                    callback();
                });
            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }
                callback();
            });
        },

        // Save tax_amount of line items
        function (callback) {
            if (!lineItemTaxHash) {
                callback();
                return;
            }

            var lineItemDao = daos.createDao('LineItem', context);
            async.forEachSeries(order.lineItems, function (lineItem, callback) {
                var taxAmount = roundMoney(lineItemTaxHash[lineItem.id] || 0);
                lineItemDao.setTaxAmountOfLineItem(lineItem, taxAmount, callback);
            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }
                callback();
            });
        },

        function (callback) {
            fireOrderEvent(context, 'createOrder', 'onSaveAdjustments', {}, order, callback);
        },

        function (callback) {
            // save additional adjustments
            var additionalAdjustments = order.groupedAdjustments && order.groupedAdjustments.additional;
            if (!additionalAdjustments || !additionalAdjustments.length) {
                callback();
                return;
            }

            async.forEachSeries(additionalAdjustments, function (additionalAdjustment, callback) {
                adjustment = {
                    order_id : order.id,
                    amount : additionalAdjustment.amount,
                    label : additionalAdjustment.label,
                    source_type : 'Order',
                    source_id : order.id
                };

                adjustmentDao.createAdjustment(adjustment, function (error, newAdjustment) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    order.adjustments.push(newAdjustment);
                    callback();
                });

            }, function (error) {
                callback(error);
            });
        },

        function (callback) {
            refreshOrderTotalAndAdjustmentTotal(order);
            order.save(['total', 'adjustment_total']).success(function () {
                callback();
            }).error(callback);
        }
    ], callback);
}


function getCountriesOfLineItem(context, lineItem, callback) {
    async.waterfall([
        function (callback) {
            if (lineItem.variant) {
                callback(null, lineItem.variant);
                return;
            }

            var variantDao = daos.createDao('Variant', context);
            variantDao.getById(lineItem.variant_id, callback);
        },

        function (variant, callback) {
            var productDao = daos.createDao('Product', context);
            productDao.getCountriesOfProduct(variant.product_id, callback);
        }
    ], callback);
}


function getPaymentGatewayAddressOfOrder(context, order, callback) {
    var logger = context.logger,
        countryDao = daos.createDao('Country', context),
        userSoldAddress;

    logger.debug('Getting payment gateway address of order %d', order.id);
    async.waterfall([
        function (callback) {
            countryDao.getCountryById(order.shippingAddress.country_id, callback);
        },

        function (countryOfShippingAddress, next) {
            // use shipping address of order if the country of shipping address is active
            if (countryOfShippingAddress) {
                logger.debug('Use shipping address as payment gateway address');
                callback(null, order.shippingAddress);
                return;
            }
            next();
        },

        function (callback) {
            getUserOfOrder(context, order, callback);
        },

        function (userOfOrder, callback) {
            var userDao = daos.createDao('User', context);
            userDao.getSoldAddressOfUser(userOfOrder, callback);
        },

        function (soldAddress, callback) {
            userSoldAddress = soldAddress;
            countryDao.getCountryById(soldAddress.country_id, callback);
        },

        function (countryOfSoldAddress, next) {
            // use sold address of user if the country of sold address using the same currency as the order's currency
            if (countryOfSoldAddress.currency_id === order.currency_id) {
                callback(null, userSoldAddress);
                return;
            }
            next();
        },

        function (callback) {
            // get the first product sold in country using the same currency as the order's currency
            getCountriesOfLineItem(context, order.lineItems[0], callback);
        },

        function (countries, callback) {
            var country,
                i,
                countryIdOfPaymentAddress,
                error;

            for (i = 0; i < countries.length; i += 1) {
                country = countries[i];
                if (country.currency_id === order.currency_id) {
                    countryIdOfPaymentAddress = country.id;
                    break;
                }
            }

            if (!countryIdOfPaymentAddress) {
                error = new Error('Can not determine the payment gate way address of order.');
                callback(error);
                return;
            }

            callback(null, {country_id : countryIdOfPaymentAddress});
        }

    ], callback);
}

function rejectGiftCardPaymentMethods(paymentMethods) {
    if (!paymentMethods) {
        return null;
    }

    var noGiftCardPaymentMethods = u.reject(paymentMethods, function (paymentMethod) {
        return paymentMethod.type === 'PaymentMethod::GiftCard';
    });

    return noGiftCardPaymentMethods;
}


function getPaymentMethodsByCountryId(context, countryId, activeFor, isForAdmin, callback) {
    var logger = context.logger;

    logger.debug('Getting payment methods by country %d', countryId);
    async.waterfall([
        function (callback) {
            getZoneIdsByCountryIdAndStateId(context, countryId, 0, callback);
        },

        function (paymentZoneIds, callback) {
            var paymentMethodDao = daos.createDao('PaymentMethod', context),
                environment = 'production';

            paymentMethodDao.getPaymentMethodsInZones(paymentZoneIds, environment, activeFor, isForAdmin, callback);
        }
    ], callback);
}

function getAllPaymentMethodsByCountryId(context, countryId, callback) {
    var logger = context.logger;

    logger.debug('Getting payment methods by country %d', countryId);
    async.waterfall([
        function (callback) {
            getZoneIdsByCountryIdAndStateId(context, countryId, 0, callback);
        },

        function (paymentZoneIds, callback) {
            var paymentMethodDao = daos.createDao('PaymentMethod', context),
                environment = 'production';

            paymentMethodDao.getAllPaymentMethodsInZones(paymentZoneIds, environment, callback);
        }
    ], callback);
}


function getAvailableNoCreditcardPaymentMethods(paymentMethods, callback) {
    var availablePaymentMethods = [];
    paymentMethods.forEach(function (eachPaymentMethod) {
        if (eachPaymentMethod.is_creditcard) {
            return;
        }

        // TODO: make it possible to config what kinds of payment methods are enabled in a country.
        availablePaymentMethods.push(eachPaymentMethod);
    });

    callback(null, availablePaymentMethods);
}


function getPaymentGatewayVolumes(context, countryId, paymentMethodIds, month, callback) {
    var sqlStmt = "SELECT payment_method_id, gateway_volume as volume FROM data_management.gateway_volume WHERE country_id = $1 AND current_month = $2 AND payment_method_id in (" + paymentMethodIds.join(',') + ")",
        sqlParams = [countryId, month];

    context.logger.trace(
        'Executing sql query: %s with sqlParams %j',
        sqlStmt,
        sqlParams
    );
    context.readDatabaseClient.query(sqlStmt, sqlParams, function (error, result) {
        if (error) {
            callback(error);
            return;
        }
        callback(null, result.rows);
    });
}


function getAvailableCreditcardPaymentMethod(context, countryId, paymentMethods, callback) {
    var logger = context.logger,
        creditcardMethods,
        creditcardMethodIds,
        totalPercentage;

    creditcardMethods = u.filter(paymentMethods, function (eachMethod) {
        return eachMethod.is_creditcard;
    });

    if (!creditcardMethods.length) {
        callback(null, null);
        return;
    }

    creditcardMethodIds = u.map(paymentMethods, function (eachMethod) {
        return eachMethod.id;
    });
    totalPercentage = u.reduce(creditcardMethods, function (sum, eachMethod) {
        return sum + eachMethod.percentage;
    }, 0);

    logger.debug(
        'Getting available creditcard payment methods of country %d from %d payment methods.',
        countryId,
        paymentMethods.length
    );
    logger.debug('creditcard methods: %s', creditcardMethodIds);
    logger.debug('Total creditcard payment percentage: %d', totalPercentage);

    async.waterfall([
        function (callback) {
            // get current month gateway volumes
            var currentMonth = new Date().getMonth() + 1;
            getPaymentGatewayVolumes(context, countryId, creditcardMethodIds, currentMonth, callback);
        },

        function (paymentGatewayVolumes, callback) {
            var volumesMap,
                volumeTotal,
                availablePaymentMethods;

            volumesMap = u.reduce(paymentGatewayVolumes, function (map, eachVolume) {
                map[eachVolume.payment_method_id] = eachVolume;
                return map;
            }, {});

            volumeTotal = u.reduce(paymentGatewayVolumes, function (sum, eachVolume) {
                return sum + eachVolume.volume;
            }, 0);

            logger.debug('Total payment gateway volume of this month: %d', volumeTotal);

            availablePaymentMethods = u.filter(creditcardMethods, function (eachCreditcardMethod) {
                if (!volumeTotal) {
                    return !!creditcardMethods.percentage;
                }

                var allowedPaymentPercentage = eachCreditcardMethod.percentage / totalPercentage,
                    gatewayVolume = volumesMap[eachCreditcardMethod.id],
                    currentMonthPaymentPercentage = volumeTotal ? (gatewayVolume.volume / volumeTotal) : 0;

                return currentMonthPaymentPercentage < allowedPaymentPercentage;
            });

            if (availablePaymentMethods.length === 0) {
                callback(null, creditcardMethods[0]);
            } else {
                callback(null, availablePaymentMethods[0]);
            }
        }
    ], callback);
}

function getAllAvailablePaymentMethodsByCountryId(context, countryId, callback) {
    var logger = context.logger,
        availablePaymentMethods = [];

    logger.debug('Getting all available payment methods by country %d', countryId);
    getAllPaymentMethodsByCountryId(context, countryId, callback);
}


function getAvailablePaymentMethodsByCountryId(context, countryId, ignoreCreditcardMethods, isForAdmin, callback) {
    var logger = context.logger,
        availablePaymentMethods = [];

    logger.debug('Getting available payment methods by country %d', countryId);
    async.waterfall([
        function (callback) {
            getPaymentMethodsByCountryId(context, countryId, 'all', isForAdmin, callback);
        },

        function (paymentMethods, callback) {
            if (ignoreCreditcardMethods) {
                callback(null, paymentMethods);
                return;
            }

            getAvailableCreditcardPaymentMethod(context, countryId, paymentMethods, function (error, paymentMethod) {
                if (error) {
                    callback(error);
                    return;
                }

                if (paymentMethod) {
                    availablePaymentMethods = availablePaymentMethods.concat(paymentMethod);
                }

                callback(null, paymentMethods);
            });
        },

        function (paymentMethods, callback) {
            getAvailableNoCreditcardPaymentMethods(paymentMethods, function (error, noCreditcardPaymentMethods) {
                if (error) {
                    callback(error);
                    return;
                }

                if (noCreditcardPaymentMethods && noCreditcardPaymentMethods.length) {
                    availablePaymentMethods = availablePaymentMethods.concat(noCreditcardPaymentMethods);
                }

                callback(null, availablePaymentMethods);
            });
        },

        function (paymentMethods, callback) {
            if (context.config.application.enableHyperwallet) {
                callback(null, paymentMethods);
                return;
            }

            var noHyperwalletPaymentMethods = u.reject(paymentMethods, function (paymentMethod) {
                return paymentMethod.name.toLowerCase().indexOf('hyperwallet') !== -1;
            });
            callback(null, noHyperwalletPaymentMethods);
        }

    ], callback);
}


function getAvailableAutoshipPaymentMethodsByCountryId(context, countryId, callback) {
    var logger = context.logger,
        paymentMethods,
        autoshipPaymentMethods = [],
        isForAdmin = false;

    logger.debug('Getting available autoship payment methods by country %d', countryId);
    async.waterfall([
        function (callback) {
            getPaymentMethodsByCountryId(context, countryId, 'autoship', isForAdmin, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                paymentMethods = result;
                callback();
            });
        },

        function (callback) {
            getAvailableCreditcardPaymentMethod(context, countryId, paymentMethods, function (error, creditPaymentMethod) {
                if (error) {
                    callback(error);
                    return;
                }

                if (creditPaymentMethod) {
                    autoshipPaymentMethods = autoshipPaymentMethods.concat(creditPaymentMethod);
                }

                callback();
            });
        },

        function (callback) {
            if (context.config.application.enableCashAutoship) {
                var cashPaymentMethod = u.find(paymentMethods, function (item) {return item.type === 'PaymentMethod::Cash'});
                if (cashPaymentMethod) {
                    autoshipPaymentMethods = autoshipPaymentMethods.concat(cashPaymentMethod);
                }
            }

            callback(null, autoshipPaymentMethods);
        }
    ], callback);
}


function getAvailablePaymentMethodsOfOrder(context, order, callback) {
    if (order.availablePaymentMethods) {
        callback(null, order.availablePaymentMethods);
        return;
    }

    if (order.autoship) {
        getAvailableAutoshipPaymentMethodsByCountryId(context, order.shippingAddress.country_id, callback);
        return;
    }

    var ignoreCreditcardMethods = false,
        purchase_limit = context.config.application.purchase_limit || -1;
    if (purchase_limit !== -1) {
        if (order.total > context.config.application.purchase_limit) {
            ignoreCreditcardMethods = true;
        }
    }

    getAvailablePaymentMethodsByCountryId(context, order.shippingAddress.country_id, ignoreCreditcardMethods, order.isAdmin, function (error, paymentMethods) {
        if (error) {
            callback(error);
            return;
        }

        order.availablePaymentMethods = paymentMethods;
        callback(null, paymentMethods);
    });
}


function getAvailableGiftCardPaymentMethodOfOrder(context, order, callback) {
    async.waterfall([
        function (callback) {
            getAvailablePaymentMethodsOfOrder(context, order, callback);
        },

        function (paymentMethods, callback) {
            var i,
                paymentMethod;

            for (i = 0; i < paymentMethods.length; i += 1) {
                paymentMethod = paymentMethods[i];

                if (paymentMethod.type === 'PaymentMethod::GiftCard') {
                    callback(null, paymentMethod);
                    return;
                }
            }

            callback(null, null);
        }
    ], callback);
}


function isPaymentMethodAvailableToOrder(context, order, paymentMethodId, callback) {
    async.waterfall([
        function (callback) {
            getAvailablePaymentMethodsOfOrder(context, order, callback);
        },

        function (paymentMethods, callback) {
            var paymentMethod,
                i;

            for (i = 0; i < paymentMethods.length; i += 1) {
                paymentMethod = paymentMethods[i];
                if (paymentMethod.id === paymentMethodId) {
                    callback(null, true);
                    return;
                }
            }
            callback(null, false);
        }
    ], callback);
}


function getAddressesOfOrder(context, order, callback) {
    if (order.billingAddress &&
            order.shippingAddress &&
            order.billingAddress.id === order.bill_address_id &&
            order.shippingAddress.id === order.ship_address_id) {
        callback();
        return;
    }

    var addressDao = daos.createDao('Address', context);

    async.series({
        billingAddress : function (callback) {
            if (!order.bill_address_id) {
                callback(null, null);
                return;
            }
            addressDao.getAddressInfo(order.bill_address_id, callback);
        },

        shippingAddress : function (callback) {
            if (!order.ship_address_id) {
                callback(null, null);
                return;
            }
            addressDao.getAddressInfo(order.ship_address_id, callback);
        }
    }, function (error, addresses) {
        if (error) {
            callback(error);
            return;
        }
        order.billingAddress = addresses.billingAddress;
        order.shippingAddress = addresses.shippingAddress;
        callback();
    });
}


function getAdjustmentsOfOrder(context, order, callback) {
    if (order.adjustments) {
        callback(null, order.adjustments);
        return;
    }

    var adjustmentDao = daos.createDao('Adjustment', context);
    adjustmentDao.getAdjustmentsOfOrder(order.id, function (error, adjustments) {
        if (error) {
            callback(error);
            return;
        }

        order.adjustments = adjustments;
        callback(null, adjustments);
    });
}


function getPaymentsOfOrder(context, order, callback) {
    var paymentDao = daos.createDao('Payment', context);
    paymentDao.getPaymentsOfOrder(order.id, callback);
}


function getShipmentsOfOrder(context, order, callback) {
    var shipmentDao = daos.createDao('Shipment', context);
    shipmentDao.getShipmentsOfOrder(order.id, callback);
}


function updateStateOfShipment(context, order, state, callback) {
    if (order.isNoShipping) {
        callback();
        return;
    }

    var shipmentDao = daos.createDao('Shipment', context);

    async.waterfall([
        function (callback) {
            shipmentDao.getShipmentByOrderIdAndShippingMethodId(order.id, order.shipping_method_id, callback);
        },

        function (shipment, callback) {
            shipmentDao.updateStateOfShipment(shipment, state, callback);
        }
    ], callback);
}


function updatePaymentStateOfOrder(context, order, paymentTotal, paymentState, callback) {
    if (order.payment_total === paymentTotal &&
            order.payment_state === paymentState) {
        callback();
        return;
    }


    var logger = context.logger,
        stateEventDao = daos.createDao('StateEvent', context),
        previousOrderState = order.state,
        previousShipmentState = order.shipment_state,
        previousPaymentState = order.payment_state;

    logger.debug('Update payment_state of order from `%s` to `%s`.', previousPaymentState, paymentState);
    async.waterfall([
        function (callback) {
            // change shipment state only if the order need to be ship
            if (order.isNoShipping) {
                callback();
                return;
            }

            // change shipment state if payment_state is 'paid' or 'credit_owed'
            if (paymentState !== 'paid' && paymentState !== 'credit_owed') {
                callback();
                return;
            }

            if (order.shipment_state !== 'pending') {
                callback();
                return;
            }

            updateStateOfShipment(context, order, 'ready', function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                order.shipment_state = 'ready';
                callback();
            });
        },

        function (callback) {
            // save payment_total and payment_state
            var fieldsToUpdate = ['payment_total', 'payment_state'];

            order.payment_total = paymentTotal;
            order.payment_state = paymentState;
            if (order.state === 'payment'
                    && (paymentState === 'balance_due' || paymentState === 'paid' || paymentState === 'credit_owed')) {
                order.state = 'complete';
                order.completed_at = new Date();
                fieldsToUpdate.push('state');
                fieldsToUpdate.push('completed_at');
            }
            if (order.shipment_state !== previousShipmentState) {
                fieldsToUpdate.push('shipment_state');
            }

            order.save(fieldsToUpdate).success(function () {
                callback();
            }).error(callback);
        },

        function (callback) {
            // create state_event for payment
            if (order.payment_state === previousPaymentState) {
                callback();
                return;
            }

            var stateEvent = {
                    stateful_id : order.id,
                    stateful_type : 'Order',
                    user_id : order.user_id,
                    name : 'payment',
                    previous_state : previousPaymentState,
                    next_state : order.payment_state
                };
            stateEventDao.createStateEvent(stateEvent, function (error, newStateEvent) {
                callback(error);
            });
        },

        function (callback) {
            // create state_event for shipment
            if (order.shipment_state === previousShipmentState) {
                callback();
                return;
            }

            var stateEvent = {
                    stateful_id : order.id,
                    stateful_type : 'Order',
                    user_id : order.user_id,
                    name : 'shipment',
                    previous_state : previousShipmentState,
                    next_state : order.shipment_state
                };
            stateEventDao.createStateEvent(stateEvent, function (error, newStateEvent) {
                callback(error);
            });
        },

        function (callback) {
            // create state_event for order
            if (order.state === previousOrderState) {
                callback();
                return;
            }

            var stateEvent = {
                    stateful_id : order.id,
                    stateful_type : 'Order',
                    user_id : order.user_id,
                    name : 'order',
                    previous_state : previousOrderState,
                    next_state : order.state
                };
            stateEventDao.createStateEvent(stateEvent, function (error, newStateEvent) {
                callback(error);
            });
        }
    ], callback);
}

function updateTotalOfOrder(context, order, total, adjustmentTotal, paymentState, callback) {
    if (order.total === total &&
            order.adjustment_total === adjustmentTotal &&
            order.paymentState === paymentState) {
        callback();
        return;
    }

    var previousPaymentState = order.paymentState;

    async.waterfall([
        function (callback) {
            var fieldsToUpdate = [];

            if (order.total !== total) {
                order.total = total;
                fieldsToUpdate.push('total');
            }

            if (order.adjustment_total !== adjustmentTotal) {
                order.adjustment_total = adjustmentTotal;
                fieldsToUpdate.push('adjustment_total');
            }

            if (order.payment_state !== paymentState) {
                order.payment_state = paymentState;
                fieldsToUpdate.push('payment_state');
            }

            order.save(fieldsToUpdate).success(function () {
                callback();
            }).error(callback);
        },

        function (callback) {
            // create state_event for payment
            if (order.payment_state === previousPaymentState) {
                callback();
                return;
            }

            var stateEventDao = daos.createDao('StateEvent', context),
                stateEvent = {
                    stateful_id : order.id,
                    stateful_type : 'Order',
                    user_id : order.user_id,
                    name : 'payment',
                    previous_state : previousPaymentState,
                    next_state : order.payment_state
                };
            stateEventDao.createStateEvent(stateEvent, function (error, newStateEvent) {
                callback(error);
            });
        }
    ], callback);
}

function setOrderPaymentStateToPending(context, order, callback) {
    if (order.state === 'complete' && order.payment_state === 'pending') {
        callback();
        return;
    }

    var stateEventDao = daos.createDao('StateEvent', context),
        previousPaymentState = order.payment_state,
        previousOrderState = order.state;

    async.waterfall([
        function (callback) {
            order.state = 'complete';
            order.payment_state = 'balance_due';
            order.completed_at = new Date();

            order.save(['state', 'payment_state', 'completed_at']).done(function (error) {
                callback(error);
            });
        },

        function (callback) {
            // create state_event for payment
            if (order.payment_state === previousPaymentState) {
                callback();
                return;
            }

            var stateEvent = {
                    stateful_id : order.id,
                    stateful_type : 'Order',
                    user_id : order.user_id,
                    name : 'payment',
                    previous_state : previousPaymentState,
                    next_state : order.payment_state
                };
            stateEventDao.createStateEvent(stateEvent, function (error, newStateEvent) {
                callback(error);
            });
        },

        function (callback) {
            // create state_event for order
            if (order.state === previousOrderState) {
                callback();
                return;
            }

            var stateEvent = {
                    stateful_id : order.id,
                    stateful_type : 'Order',
                    user_id : order.user_id,
                    name : 'order',
                    previous_state : previousOrderState,
                    next_state : order.state
                };
            stateEventDao.createStateEvent(stateEvent, function (error, newStateEvent) {
                callback(error);
            });
        }
    ], callback);
}


function assignOpeningInventory(context, order, callback) {
    var inventoryUnitDao = daos.createDao('InventoryUnit', context);
    inventoryUnitDao.assignOpeningInventory(order, callback);
}


function createBusinessCenterIfNecessary(context, order, callback) {
    var logger = context.logger,
        config = context.config;

    logger.debug('begin creating business center...');

    if (!config.application.enableCreatingBusinessCenter) {
        logger.debug("business center disabled.");
        callback();
        return;
    }

    async.waterfall([
        function (callback) {
            isLineItemsContainProductInTaxonByNames(context, order.lineItems, ['Platinum Set', 'Premium Set'], callback);
        },

        function (includePlatinumOrPremium, next) {
            if (!includePlatinumOrPremium) {
                logger.debug("not include platinum or premium.");
                callback();
                return;
            }

            var userDao = daos.createDao('User', context);
            userDao.getDistributorOfUser(order.user, next);
        },

        function (distributor, callback) {
            var queryDatabaseOptions = {
                    sqlStmt : 'SELECT * FROM zv_create_business_center($1)',
                    sqlParams : [distributor.id]
                };
            DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                callback(error);
            });
        }
    ], callback);
}


function updateLifetimeRank(context, order, callback) {
    callback();
}

// set life time rank when register distributor
function initLifetimeRank(context, user, callback) {
    var logger = context.logger,
        userDao = daos.createDao('User', context);

    logger.debug("Updating lifetime rank...");
    async.waterfall([
        function (next) {
            logger.debug("Checking if user is 'Distributor'...");
            userDao.isDistributor(user, function (error, isDistributor) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!isDistributor) {
                    logger.debug("User is not a 'Distributor', no need to set life time rank.");
                    callback();
                    return;
                }

                next();
            });
        },

        function (callback) {
            var initialLifetimeRank = context.config.application.initialLifetimeRank;
            if (u.isUndefined(initialLifetimeRank)){
                initialLifetimeRank = 40;
            }
            userDao.updateLifetimeRank(user, initialLifetimeRank, callback);
        }
    ], callback);
}

function updateDualteamSettings(context, order, callback) {
    var logger = context.logger,
        userDao = daos.createDao('User', context),
        user = order.user;

    logger.debug("Updating dualteam settings...");
    async.waterfall([
        function (callback) {
            logger.debug("Checking if user is 'Independent Partner' or 'Preferred Customer'...");

            userDao.isDistributor(user, function (error, isDistributor) {
                if (error) {
                    callback(error);
                    return;
                }

                if (isDistributor) {
                    callback(null, true);
                    return;
                }

                userDao.isPreferredCustomer(user, function (error, isPreferredCustomer) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (isPreferredCustomer) {
                        callback(null, true);
                        return;
                    }

                    callback(null, false);
                });
            });
        },

        function (isInRoles, next) {
            if (!isInRoles) {
                logger.debug("Is not 'Independent Partner' or 'Preferred Customer', no need to update dualteam settings.");
                callback();
                return;
            }

            userDao.getDistributorOfUser(user, next);
        },

        function (distributor, callback) {
            var distributorDao = daos.createDao('Distributor', context);
            distributorDao.setDualteamSettings(distributor, order.dualteamOptions, callback);
        },

        function (savedDistributor, callback) {
            user.distributor = savedDistributor;
            callback();
        }
    ], callback);
}

function updateForcedMatrixSettings(context, order, callback) {
    var logger = context.logger;
    var userDao = daos.createDao('User', context);
    var user = order.user;
    var forcedMatrixOptions = order.forcedMatrixOptions;
    var error;

    logger.debug('Updating forced matrix position...');

    // setting forced matrix
    if (context.companyCode !== 'MMD') {
        //skip
        callback();
        return;
    }

    async.waterfall([

        function (callback) {

            userDao.getDistributorOfUser(user, callback);
        },

        function (distributor, callback) {

            if(!distributor){
                logger.error('distributor is not found by user_id:', user.id);
                callback();
                return;
            }
            var forcedMatrixDAO = daos.createDao('ForcedMatrix', context);

            forcedMatrixDAO.findAndSettingTree({
                forcedMatrix: forcedMatrixOptions,
                sponsorId: distributor.personal_sponsor_distributor_id,
                distributorId: distributor.id
            }, function(error, result) {
                //TODO:
                //
                //
                callback();
            });
        }
    ], callback);
}


function initDistributorSettings(context, order, user, callback) {
    var userDao = daos.createDao('User', context),
        distributorDao = daos.createDao('Distributor', context);

    async.waterfall([
        function (callback) {
            initLifetimeRank(context, user, callback);
        },

        function (callback) {
            userDao.getDistributorOfUser(user, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                distributor = result;
                callback();
            });
        },

        function (callback) {
            updateDualteamSettings(context, order, callback);
        },

        function (callback) {
            var packtypeId = order.lineItems[0].variant.packtype_id;
            distributorDao.updatePacktypeOfDistributor(distributor, packtypeId, callback);
        }
    ], callback);
}


function disableDistributorAuthTokens(context, distributor, currentTokenHmacKey, callback) {
    var oauthTokens = null;

    async.waterfall([
        function (callback) {
            var queryDatabaseOptions = {
                useWriteDatabase : true,
                sqlStmt : "select * from mobile.oauth_tokens where distributor_id=$1 and hmac_key!=$2 and active != false",
                sqlParams : [distributor.id, currentTokenHmacKey]
            };
            DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }
                oauthTokens = result.rows;
                callback();
            });

        },
        function (callback) {
            var queryDatabaseOptions = {
                    useWriteDatabase : true,
                    sqlStmt : "update mobile.oauth_tokens set active=false, updated_at=now() where distributor_id=$1 and hmac_key!=$2",
                    sqlParams : [distributor.id, currentTokenHmacKey]
                };
            DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                if (error) {
                    callback(error);
                    return;
                }
                callback();
            });
        },
        function (callback) {
            async.forEachSeries(oauthTokens, function (oauthToken, callback) {
                var queryDatabaseOptions = {
                    useWriteDatabase : true,
                    sqlStmt : "update mobile.devices set active=false, updated_at=now() where distributor_id=$1 and device_id=$2",
                    sqlParams : [oauthToken.distributor_id, oauthToken.device_id]
                };
                DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                    if (error) {
                        callback(error);
                        return;
                    }
                    callback();
                });
            }, callback);
        }
    ], function (error) {
        if (error) {
            context.logger.error(error);
        }
        callback();


    });
}

/**
* async callback whether it is registry distributor
* @param {Object} options
*   options:
*       nextCallback: {Function} async waterfall function next callback
*       context: {Object}
*       lineItems: {Array}
*  @param {Function} callback
*  @return {undefined}
*/
function callbackIsRegistrationDistributor (options, callback) {
    var nextCallback = options.nextCallback;
    var context = options.context;
    var lineItems = options.lineItems;
    var user = options.user;

    if(context.companyCode !== 'MMD'){
        // complete registration if bought any enrollment products,
        // upgrade if bought any membership products
        isLineItemsContainProductInTaxonByNames(context, lineItems, ['Membership', 'Enrollment'], function (error, boughtMembership) {
            if (error) {
                callback(error);
                return;
            }

            if (!boughtMembership) {
                callback();
                return;
            }

            nextCallback();
        });
    }
    else {  //MMD company
        async.waterfall([

            function (next) {
                getProductsWithPropertyByTaxonNames({
                    context: context,
                    lineItems: lineItems,
                    taxonNames: ['Membership']
                }, next);
            },

            function (productInfos, next) {
                var renewalDateProductionInfos =
                    getRenewalDateInfosByMemberShipPropertyInfos(productInfos);

                // context.logger.debug('renewalDateProductionInfos:',
                //     JSON.stringify(renewalDateProductionInfos, 3));
                if(renewalDateProductionInfos.isRenewalSpecialDistributorDate === true) {
                    next();
                }
                else {
                    //Retail user need set to Active too
                    var userDao = daos.createDao('User', context);
                    userDao.setStatusOfUserByStatusName(user, 'Active', callback);
                }
            }

        ], function (error, result) {
            if(error) {
                callback(error);
                return;
            }

            nextCallback();
        });
    }
}

function completeDistributorRegistration(context, order, callback) {
    var user = order.user;
    var userDao = daos.createDao('User', context);
    var distributorDao = daos.createDao('Distributor', context);
    var distributor;

    async.waterfall([
        function (next) {
            if (order.special_instructions === 'upgrade to distributor order') {
                next();
                return;
            }

            userDao.isUserUnregistered(user, function (error, isUnregistered) {
                if (error) {
                    callback(error);
                    return;
                }

                context.logger.debug('user isUnregistered is:', isUnregistered);
                if (!isUnregistered) {
                    callback();
                    return;
                }

                next();
            });
        },


        function (callback) {
            updateForcedMatrixSettings(context, order, callback);
        },

        function (next) {
            callbackIsRegistrationDistributor({
                context: context,
                lineItems: order.lineItems,
                user: user,
                nextCallback: next
            }, callback);
        },

        function (callback) {
            context.logger.debug("start update  distributor");
            userDao.changeRoleOfUserByRoleCode(user, 'D', callback);
        },

        function (callback) {
            userDao.setStatusOfUserByStatusName(user, 'Active', callback);
        },

        function (callback) {
            initDistributorSettings(context, order, user, callback);
        },

        function (callback) {
            distributorDao.getDistributorByUserId(order.user_id, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                distributor = result;
                callback();
            });
        },

        function (callback) {
            disableDistributorAuthTokens(context, distributor, context.user.hmacKey, callback);
        },

        function (callback) {
            mailHelper.sendDistributorRegistrationEmail(context, distributor, callback);
        }
    ], callback);
}

/**
* compute next renewal date
* @param {Object} options
*   options:
*       prevRenewalDate: {Date} , prev renewal date
*       monthsToRenewal: {Object} , month amount of renewal
* @return {Date} next renewal date
*/
function getRenewalDateInfosByMemberShipPropertyInfos(productWithPropertyInfos) {
    var propertyName = 'Months of Membership';
    var infos = {
        isRenwalDate: false,
        isRenewalSpecialDistributorDate: false,
        renewalDateProductInfos: [],
        renewalSpecialDistributorProductInfos: []
    };

    for(var i=0; i< productWithPropertyInfos.length; i++) {
        var productInfo = productWithPropertyInfos[i];

        if (productInfo.distributor_only_membership !== true) {
            if(productInfo.properties[propertyName]) {
                infos.isRenwalDate = true;
                infos.renewalDateProductInfos.push(productInfo);
            }
        }
        else {
            infos.isRenewalSpecialDistributorDate = true;
            infos.renewalSpecialDistributorProductInfos.push(productInfo);
        }
    }

    return infos;
}

/**
 * get month amount by product infos
 * @param {Object} productInfos Get through method getMonth1AndMonth12InfosByMemberShipPropertyInfos
 * @return {Number} Amount of month
 */
function getMonthAmountByMemberShipPropertyProductInfo (productInfos) {
    var propertyName = 'Months of Membership';
    var monthsAmount = 0;

    productInfos.forEach(function (info) {
       monthsAmount += parseInt(info.properties[propertyName].value, 10) * info.quantity;
    });

    return monthsAmount;
}

/*
 * compute medicus company next renewal date
 * @param {Object} options
 *   options:
 *      prevRenewalDate: {Date} , prev renewal date
 *      monthsToRenewal: {Object} , month amount of renewal
 * @return {Date} next renewal date
 */
function computeMedicusNextRenewalDate (options) {
    var prevRenewalDate = options.prevRenewalDate;
    var monthsToRenewal = options.monthsToRenewal;
    var today = new Date();
    var todayFullYear = today.getFullYear();
    var todayMonth = today.getMonth();
    var todayDate = today.getDate();
    var nextRenewalDate;

    if(!prevRenewalDate || prevRenewalDate < today) {
        if(monthsToRenewal === 1) {
            if(todayDate < 15) {
                nextRenewalDate = new Date(todayFullYear, todayMonth + monthsToRenewal, 1);
            }
            else {
                nextRenewalDate = new Date(todayFullYear, todayMonth + monthsToRenewal + 1, 1);
            }
        }
        else {
            nextRenewalDate = new Date(todayFullYear, todayMonth + monthsToRenewal + 1, 1);
        }
    }
    else {
        nextRenewalDate = new Date(
            prevRenewalDate.getFullYear(),
            prevRenewalDate.getMonth() + monthsToRenewal,
            1
        );
    }

    return nextRenewalDate;
}

/**
* compute next renewal date
* @param {Object} options
*   options:
*       prevRenewalDate: {Date} , prev renewal date
*       monthsToRenewal: {Object} , month amount of renewal
* @return {Date} next renewal date
*/
function computeRenewalDate (options) {
    var prevRenewalDate = options.prevRenewalDate;
    var monthsToRenewal = options.monthsToRenewal;
    var companyCode = options.companyCode;
    var today = new Date();
    var todayFullYear = today.getFullYear();
    var todayMonth = today.getMonth();
    var todayDate = today.getDate();
    var nextRenewalDate;

    if(companyCode !== 'MMD') {
        if (!prevRenewalDate) {
            nextRenewalDate = new Date(todayFullYear, todayMonth + monthsToRenewal, todayDate);
        }
        else {
            if (prevRenewalDate < today) {
                prevRenewalDate = today;
            }
            nextRenewalDate = new Date(
                    prevRenewalDate.getFullYear(),
                    prevRenewalDate.getMonth() + monthsToRenewal,
                    prevRenewalDate.getDate()
                );
        }
    }
    else {  //MMD company rules
        nextRenewalDate = computeMedicusNextRenewalDate(options);
    }

    return nextRenewalDate;
}

/**
* get distributor next renewal date
* @param {Object} options
*   options:
*       distributor: {Object}
*       infos: {Object} , get through method getMonth1AndMonth12InfosByMemberShipPropertyInfos
* @return {Date} next renewal date
*/
function getDistributorNextRenewalDate (options) {
    var distributor = options.distributor;
    var renewalDateMemberShipPropertyInfos = options.infos;
    var companyCode = options.companyCode;
    var monthsToRenewal = 0;
    var nextRenewalDate = distributor.next_renewal_date;

    if(renewalDateMemberShipPropertyInfos.isRenwalDate === true){
        monthsToRenewal = getMonthAmountByMemberShipPropertyProductInfo(
            renewalDateMemberShipPropertyInfos.renewalDateProductInfos);
        nextRenewalDate = computeRenewalDate({
            prevRenewalDate: distributor.next_renewal_date,
            monthsToRenewal: monthsToRenewal,
            companyCode: companyCode
        });
    }

    return nextRenewalDate;
}

/**
* get distributor next renewal date monthly
* @param {Object} options
*   options:
*       distributor: {Object}
*       infos: {Object} , get through method getMonth1AndMonth12InfosByMemberShipPropertyInfos
* @return {Date} next renewal date
*/
function getSpecialDistributorNextRenewalDate (options) {
    var distributor = options.distributor;
    var renewalDateMemberShipPropertyInfos = options.infos;
    var companyCode = options.companyCode;
    var monthsToRenewal = 0;
    var nextRenewalDate = distributor.special_distributor_next_renewal_date;

    if(renewalDateMemberShipPropertyInfos.isRenewalSpecialDistributorDate === true){
        monthsToRenewal = getMonthAmountByMemberShipPropertyProductInfo(
            renewalDateMemberShipPropertyInfos.renewalSpecialDistributorProductInfos);
        nextRenewalDate = computeRenewalDate({
            prevRenewalDate: distributor.special_distributor_next_renewal_date,
            monthsToRenewal: monthsToRenewal,
            companyCode: companyCode
        });
    }

    return nextRenewalDate;
}

/**
* update renewal date by product infos
* @param {object} options
*   options:
*       context: {object}
*       productInfos: {object} products with Propertys
*       distributor: {object}
* @param {Function} callback
* @return {undefined}
*/
function updateRenewalDate (options, callback) {
    var context = options.context;
    var productWithPropertyInfos = options.productInfos;
    var distributor = options.distributor;
    var infos = getRenewalDateInfosByMemberShipPropertyInfos(productWithPropertyInfos);
    var nextRenewalDateInfos = {};
    var logger = context.logger;

    logger.debug("context.companyCode:", context.companyCode);
    logger.debug("infos:", JSON.stringify(infos));

    nextRenewalDateInfos.distributor = distributor;
    nextRenewalDateInfos.nextRenewalDate = getDistributorNextRenewalDate({
        distributor: distributor,
        infos: infos,
        companyCode: context.companyCode
    });
    nextRenewalDateInfos.SpecialDistributorNextRenewalDate = getSpecialDistributorNextRenewalDate({
        distributor: distributor,
        infos: infos,
        companyCode: context.companyCode
    });


    var distributorDao = daos.createDao('Distributor', context);
    distributorDao.updateNextRenewalDateOfDistributor(nextRenewalDateInfos, callback);
}

function updateNextRenewalDateIfNecessary(context, order, callback) {
    var logger = context.logger;
    var user = order.user;
    var distributor;

    logger.debug("try update next renewal date...");

    async.waterfall([
        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getDistributorOfUser(user, callback);
        },

        function (result, next) {
            distributor = result;
            getProductsWithPropertyByTaxonNames({
                context: context,
                lineItems: order.lineItems,
                taxonNames: ['Membership', 'System']
            }, next);
        },

        function (productInfos, callback) {
            updateRenewalDate({
                context: context,
                distributor: distributor,
                productInfos: productInfos
            }, callback);
        },

        function (callback) {
            cacheHelper.del(context, cacheKey.productCatalogByUserId(order.user_id), function () {
                callback();
            });
        }
    ], callback);
}


function activateGiftCardIfNecessary(context, order, callback) {
    async.waterfall([
        function (callback) {
            isLineItemsContainProductInCatalogByCode(context, order.lineItems, 'GC', callback);
        },

        function (containGiftCard, callback) {
            if (!containGiftCard) {
                callback();
                return;
            }

            var giftCardDao = daos.createDao('GiftCard', context);
            giftCardDao.activateGiftCardsByOrder(order, callback);
        }
    ], callback);
}


function deleteProductCatalogCacheIfNecessary(context, order, callback) {
    async.waterfall([
        function (callback) {
            isLineItemsContainPromotionalProduct(context, order.lineItems, callback);
        },

        function (isContain, next) {
            if (!isContain) {
                callback();
                return;
            }

            var userDao = daos.createDao('User', context);
            userDao.getDistributorOfUser(order.user, next);
        },

        function (distributor, callback) {
            cacheHelper.del(context, cacheKey.productCatalogByUserId(order.user_id), function () {
                callback();
            });
        }
    ], callback);
}

function deleteRecentOrdersCache(context, distributorId, callback) {
    cacheHelper.del(
        context,
        cacheKey.recentOrders(context.user.distributorId),
        function () {
            callback();
        }
    );
}

function getConfirmMailDataOfOrder(context, order, callback) {
    var logger = context.logger,
        mailData = {};

    logger.debug("Preparing mail data...");
    async.waterfall([
        function (callback) {
            mailData['email-subject'] = 'Order';
            mailData['recipient-email'] = order.email;
            mailData['order-number'] = order.number;
            mailData['order-date'] = moment(order.order_date).format('YYYY-MM-DD');
            mailData['item-total'] = order.item_total;
            mailData['adjustment-total'] = order.adjustment_total;
            mailData['payment-total'] = order.payment_total;
            mailData.state = order.state;
            mailData['payment-state'] = order.payment_state;
            mailData['shipment-state'] = order.shipment_state;

            mailData['line-items'] = order.lineItems.map(function (lineItem) {
                return {
                    name : lineItem.product_name,
                    'product-id' : lineItem.product_id,
                    sku : lineItem.sku,
                    price : lineItem.price,
                    quantity : lineItem.quantity
                };
            });

            mailData['shipping-address'] = mapper.shippingAddress(order.shippingAddress);
            callback();
        },

        function (callback) {
            getAdjustmentsOfOrder(context, order, function (error, adjustments) {
                if (error) {
                    callback(error);
                    return;
                }
                order.adjustments = adjustments;
                callback();
            });
        },

        function (callback) {
            getPaymentsOfOrder(context, order, function (error, payments) {
                if (error) {
                    callback(error);
                    return;
                }
                order.payments = payments;
                callback();
            });
        },

        function(callback){
            formatOrderForGiftCard(context, order, function(error){
                if (error) {
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function(callback){

            mailData.adjustments = order.adjustments.map(function (adjustment) {
                    return {
                        name : adjustment.label,
                        amount : adjustment.amount
                    };
                });

            mailData.total = order.total;
            callback();
        },

        function (callback) {
            Order.getCurrencyOfOrder(context, order, function (error, currency) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!currency) {
                    error = new Error("Can't get currency of order " + order.id);
                    callback(error);
                    return;
                }

                mailData['currency-symbol'] = currency.symbol;
                callback();
            });
        },

        function (callback) {
            getShippingMethodOfOrder(context, order, function (error, shippingMethod) {
                if (error) {
                    callback(error);
                    return;
                }

                if (shippingMethod) {
                    mailData['shipping-method-name'] = shippingMethod.name;
                } else {
                    mailData['shipping-method-name'] = "";
                }
                callback();
            });
        },

        function (callback) {
            callback(null, mailData);
        }

    ], callback);
}

function sendConfirmMailOfOrder(context, order, callback) {
    var logger = context.logger;

    logger.debug("Sending confirm mail of order...");
    async.waterfall([
        function (callback) {
            getConfirmMailDataOfOrder(context, order, callback);
        },

        function (mailData, callback) {
            mailService.sendMail(context, 'orders/confirmations', mailData, function (error) {
                if (error) {
                    logger.error("Failed to send confirm mail of order: %s", error.message);
                }
                callback();
            });
        }
    ], callback);
}

function isOrderAlreadyPaid(order) {
    var state = order.state,
        paymentState = order.payment_state;

    return ((state === "complete") || (state === "cancelled") || (state === "awaiting_return") || (state === "returned")) &&
        ((paymentState === "paid") || (paymentState === "credit_owed"));
}

function tryCompletePaidOrder(context, order, callback) {
    if ((order.state === 'complete') &&
            (order.payment_state === 'paid' ||
            order.payment_state === 'credit_owed')) {

        async.waterfall([
            assignOpeningInventory.bind(this, context, order),
            completeDistributorRegistration.bind(this, context, order),
            createBusinessCenterIfNecessary.bind(this, context, order),
            updateLifetimeRank.bind(this, context, order),
            updateNextRenewalDateIfNecessary.bind(this, context, order),
            activateGiftCardIfNecessary.bind(this, context, order),
            sendConfirmMailOfOrder.bind(this, context, order),
            deleteProductCatalogCacheIfNecessary.bind(this, context, order),
            deleteRecentOrdersCache.bind(this, context, context.user.distributorId)
        ], callback);
        return;
    }

    callback();
}

function afterProcessPayment(context, error, order, payment, callback) {
    var logger = context.logger;

    logger.debug('State of payment: %s', payment.state);
    if (error) {
        // payment failed
        logger.error('Process payment failed. %s', error.message);

        if (payment.state === 'failed') {
            updatePaymentStateOfOrder(context, order, order.payment_total, 'failed', function () {
                callback(error);
            });
            return;
        }

        callback(error);
        return;
    }

    if (payment.state === 'completed') {
        logger.debug('Payment completed.');

        var paymentTotal = roundMoney(order.payment_total + payment.amount),
            paymentState = 'paid';
        if (paymentTotal < order.total) {
            paymentState = 'balance_due';
        } else if (paymentTotal > order.total) {
            paymentState = 'credit_owed';
        }
        updatePaymentStateOfOrder(context, order, paymentTotal, paymentState, callback);
    } else if (payment.state === 'pending') {
        setOrderPaymentStateToPending(context, order, callback);
    } else {
        logger.debug('Payment process finished, but payment was not complete.');
        callback();
    }
}

function createPaymentToken(options, callback){
    var  context = options.context;
    var paymentMethodId = options.paymentMethodId;
    var creditcard= options.creditcard;
    var userId = options.userId;
    var billingAddressId = options.billingAddressId;

    if(context.companyCode !== 'MMD' || !options.creditcard){
        callback();
        return;
    }

    var paymentTokenDao = daos.createDao('PaymentToken', context);
    paymentTokenDao.findOrCreatePaymentToken(options, callback);

}

function payOrder(context, order, paymentData, callback) {
    var logger = context.logger,
        paymentDao = daos.createDao('Payment', context),
        paymentMethodId = paymentData.paymentMethodId,
        creditcard = paymentData.creditcard,
        paymentMethod,
        giftCardPaymentMethod,
        giftCardId,
        allPaymentAmount,  // all amount need to be paid
        giftCardPaymentAmount,
        otherPaymentAmount,
        error;

    async.waterfall([
        function (callback) {
            if (!paymentMethodId) {
                callback();
                return;
            }

            var paymentMethodDao = daos.createDao('PaymentMethod', context);
            paymentMethodDao.getById(paymentMethodId, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }
                paymentMethod = result;
                callback();
            });
        },

        function (callback) {
            // change state of order
            if (order.state === 'payment') {
                callback();
                return;
            }

            order.state = 'payment';
            order.save(['state']).success(function () {
                callback();
            }).error(callback);
        },

        function (callback) {
            // decide the payment plan
            allPaymentAmount = roundMoney(order.total - order.payment_total);

            if (!paymentData.giftCard) {
                giftCardPaymentAmount = 0;
                otherPaymentAmount = allPaymentAmount;
                callback();
                return;
            }

            var giftCardDao = daos.createDao('GiftCard', context),
                giftCard = paymentData.giftCard;
            giftCardDao.getGiftCardByCodeAndPin(giftCard.code, giftCard.pin, function (error, giftCard) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!giftCard) {
                    error = new Error("Gift card does not exist.");
                    error.errorCode = 'InvalidGiftCardCode';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                giftCardId = giftCard.id;

                if (giftCard.balance >= allPaymentAmount) {
                    giftCardPaymentAmount = allPaymentAmount;
                    otherPaymentAmount = 0;
                } else {
                    giftCardPaymentAmount = giftCard.balance;
                    otherPaymentAmount = roundMoney(allPaymentAmount - giftCardPaymentAmount);
                }

                callback();
            });
        },

        function (callback) {
            if (otherPaymentAmount > 0) {
                var specifiedPaymentAmount = roundMoney(paymentData.paymentAmount);
                if (specifiedPaymentAmount > 0) {
                    if (specifiedPaymentAmount > otherPaymentAmount) {
                        error = new Error("Too much payment amount.");
                        error.errorCode = 'InvalidPaymentAmount';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    otherPaymentAmount = specifiedPaymentAmount;
                }
            }

            callback();
        },

        function (callback) {
            // get gift-card payment method
            if (!giftCardPaymentAmount) {
                callback();
                return;
            }

            getAvailableGiftCardPaymentMethodOfOrder(context, order, function (error, paymentMethod) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!paymentMethod) {
                    error = new Error("Gift card payment is not allowed.");
                    error.errorCode = 'GiftCardPaymentNotAllowed';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                giftCardPaymentMethod = paymentMethod;
                callback();
            });
        },

        function (callback) {
            // create and process non-gift-card payment
            if (!otherPaymentAmount &&
                    (!paymentMethod || paymentMethod.name.toLowerCase().indexOf('cash') === -1)) {
                callback();
                return;
            }

            if (!paymentMethodId) {
                error = new Error('Payment method id is required.');
                error.errorCode = 'InvalidPaymentMethodId';
                error.statusCode = 400;
                callback(error);
                return;
            }

            var payment = {
                    order_id : order.id,
                    paymentMethod : paymentMethod,
                    payment_method_id : paymentMethodId,
                    amount : otherPaymentAmount,
                    bill_address_id : order.bill_address_id
                };

            if (paymentMethod.is_creditcard) {
                payment.source_type = 'Creditcard';
                payment.creditcard = creditcard;
            }

            if (paymentData.autoshipPaymentId) {
                payment.autoship_payment_id = paymentData.autoshipPaymentId;
            }

            paymentDao.createPayment(payment, function (error, payment) {
                if (error) {
                    callback(error);
                    return;
                }

                paymentDao.processPayment(order, payment, function (error) {
                    afterProcessPayment(context, error, order, payment, callback);
                });
            });
        },

        function (callback) {
            // create and process gift-card payment
            if (!giftCardPaymentAmount) {
                callback();
                return;
            }

            var payment = {
                    order_id : order.id,
                    paymentMethod : giftCardPaymentMethod,
                    payment_method_id : giftCardPaymentMethod.id,
                    amount : giftCardPaymentAmount,
                    bill_address_id : order.bill_address_id
                };

            payment.source_type = 'GiftCard';
            payment.source_id = giftCardId;
            payment.giftCard = paymentData.giftCard;

            paymentDao.createPayment(payment, function (error, payment) {
                if (error) {
                    callback(error);
                    return;
                }

                paymentDao.processPayment(order, payment, function (error) {
                    afterProcessPayment(context, error, order, payment, callback);
                });
            });
        },

        function (callback) {
            tryCompletePaidOrder(context, order, callback);
        },

        function (callback) {
            if ((order.state === 'complete') &&
                    (order.payment_state === 'paid' ||
                    order.payment_state === 'credit_owed')) {

                fireOrderEvent(context, null, 'onOrderPaid', {}, order, callback);
                return;
            }else{
                callback();
            }

        },
        //create payment Token
        function (callback) {

            if(context.companyCode !== 'MMD'){
                //skip
                callback();
                return;
            }

            if ((order.state === 'complete') &&
                    (order.payment_state === 'paid' ||
                    order.payment_state === 'credit_owed')) {


                createPaymentToken({
                    context: context,
                    paymentMethodId: paymentMethodId,
                    userId: order.user_id,
                    billingAddressId:order.bill_address_id,
                    creditcard: creditcard
                }, function(error, paymentToken){
                    //TODO:

                    callback();
                    return;
                });

            }else{
                callback();
            }

        },

        function (callback) {
            if (order.avatax_post) {
                callback();
                return;
            }

            if (order.payment_state !== 'credit_owed' && order.payment_state !== 'paid') {
                callback();
                return;
            }

            shouldUseAvalara(context, order, function (error, useAvalara) {
                if (error) {
                    logger.error('Failed to determine whether use avalara or not. %s', order.id, error.message);
                    callback();
                    return;
                }

                if (!useAvalara) {
                    callback();
                    return;
                }

                avalara.postTaxOfOrder(context, order, function (error, result) {
                    if (error) {
                        logger.error('Failed to post tax of order (id=%d). %s', order.id, error.message);
                        callback();
                        return;
                    }

                    if (!result.postTaxResult || result.postTaxResult.ResultCode !== 'Success') {
                        logger.error('Failed to post tax of order (id=%d).', order.id);
                        if (result.getTaxResult) {
                            logger.debug('result.getTaxResult.Messages: %j', result.getTaxResult && result.getTaxResult.Messages);
                        }
                        if (result.postTaxResult) {
                            logger.debug('result.postTaxResult.Messages: %j', result.postTaxResult && result.postTaxResult.Messages);
                        }
                        callback();
                        return;
                    }

                    order.avatax_get = result.taxGet;
                    order.avatax_post = result.taxPost;
                    order.save(['avatax_get', 'avatax_post']).success(function () {
                        callback();
                    }).error(callback);
                });
            });
        }
    ], callback);
}


function checkPaymentAttemptLimitOfUser(context, user, callback) {
    var logger = context.logger,
        userId = user.userId,
        sqlStmt = "select count(*) from payments p inner join orders o on p.order_id = o.id where o.state = 'payment' and p.state = 'failed' and o.user_id= $1 and o.order_date >= $2 and p.created_at >= $3;",
        sqlParams = [
            userId,
            moment().subtract('days', 7).format('YYYY-MM-DDTHH:mm:ss'), // use local time here
            moment().subtract('hours', 2).format('YYYY-MM-DDTHH:mm:ss')
        ];

    logger.trace("Checking payment attempt limit...");
    logger.trace(
        'Executing sql query: %s with sqlParams %j',
        sqlStmt,
        sqlParams
    );

    context.readDatabaseClient.query(sqlStmt, sqlParams, function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        if (!result.rows.length) {
            callback();
            return;
        }

        logger.trace("attempted %d times.", result.rows[0].count);
        if (result.rows[0].count >= 5) {
            error = new Error("Cannot process payment at this moment, please try again in 2 hours.");
            error.errorCode = 'MaxPaymentAttemptExceeded';
            error.statusCode = 403;
            callback(error);
            return;
        }

        callback();
    });
}


/*
 * Check if we need to ship the order.
 */
function isOrderNoShipping(context, order, callback) {
    var productDao = daos.createDao('Product', context),
        noShippingCount = 0;

    async.forEachSeries(order.lineItems, function (lineItem, callback) {
        productDao.getShippingCategoryByProductId(lineItem.product_id, function (error, shippingCategory) {
            if (error) {
                callback(error);
                return;
            }

            if (shippingCategory && shippingCategory.name === 'No Shipping') {
                noShippingCount += 1;
            }

            callback();
        });

    }, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, (noShippingCount === order.lineItems.length));
    });
}


function deleteOrderById(context, orderId, callback) {
    async.waterfall([
        function (callback) {
            var tables = [
                    'line_items',
                    'adjustments',
                    'payments',
                    'shipments',
                    'inventory_units'
                ];
            async.forEachSeries(tables, function (eachTable, callback) {

                var options = {
                        useWriteDatabase : true,
                        sqlStmt : 'DELETE FROM ' + eachTable + ' WHERE order_id = $1',
                        sqlParams : [orderId]
                    };
                DAO.queryDatabase(context, options, function (error) {
                    callback(error);
                });
            }, function (error) {
                callback(error);
            });
        },

        function (callback) {
            var options = {
                    useWriteDatabase : true,
                    sqlStmt : 'DELETE FROM orders WHERE id = $1',
                    sqlParams : [orderId]
                };
            DAO.queryDatabase(context, options, function (error) {
                callback(error);
            });
        }
    ], callback);
}


function formatOrderForGiftCard(context, order, callback){

    if(!order || !u.isArray(order.payments) || u.isEmpty(order.payments)){
        callback(); //return
    }

    order.adjustments =  order.adjustments || [];

    order.payments.forEach(function(payment){
        if(payment.source_type === 'GiftCard'){
            order.total = roundMoney(order.total - payment.amount);
            order.adjustments.push({
                amount : - payment.amount,
                label : 'Gift Card',
                'updated_at' : payment.updated_at,
                'created_at' : payment.created_at
            });
        }
    });

    callback();
}


function getEventCodeOfOrder(context, order, callback) {
    var queryDatabaseOptions = {
            sqlStmt: "SELECT event_code FROM events_orders WHERE order_number = $1",
            sqlParams: [order.number]
        };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        var rows = result.rows;
        callback(null, (rows && rows.length && rows[0].event_code) || null);
    });
}


function isPartyCreatorOfOrder(context, user, order, callback) {
    if (!context.config.partyPlanningService) {
        callback(null, false);
        return;
    }

    async.waterfall([
        function (callback) {
            getEventCodeOfOrder(context, order, callback);
        },

        function (eventCode, next) {
            if (!eventCode) {
                callback(null, false);
                return;
            }

            partyPlanningService.getEventById(context, eventCode, next);
        },

        function (event, callback) {
            if (!event) {
                callback(null, false);
                return;
            }

            var isCreator = event['user-id'] === user.id
            callback(null, isCreator);
        }
    ], callback);
}


function addCouponAdditionalLineItemsToOrderLineItems(coupons, items) {
    if (!coupons || !coupons.length) {
        return;
    }

    coupons.forEach(function (coupon) {
        if (!coupon.additionalLineItems || !coupon.additionalLineItems.length) {
            return;
        }

        coupon.lineItems = [];

        coupon.additionalLineItems.forEach(function (additionalLineItem) {
            items.push(additionalLineItem);
            coupon.lineItems.push({
                variantId: additionalLineItem.variantId,
                quantity: additionalLineItem.quantity,
                catalogCode: additionalLineItem.catalogCode
            });
        });
    });
}


function getLastIndexOfLineItem(lineItems, variantId, quantity, catalogCode, roleCode) {
    var i,
        lineItem;

    for (i = lineItems.length - 1; i >= 0; i -= 1) {
        lineItem = lineItems[i];
        if (lineItem.variant_id === variantId &&
                lineItem.quantity === quantity &&
                lineItem.catalog_code === catalogCode &&
                lineItem.role_code === roleCode) {
            return i;
        }
    }

    return -1;
}


function removeCouponAdditionalLineItemsFromOrderLineItems(order, coupons) {
    if (!coupons || !coupons.length) {
        return;
    }

    coupons.forEach(function (coupon) {
        if (!coupon.additionalLineItems || !coupon.additionalLineItems.length) {
            return;
        }

        coupon.lineItems = null;

        var additionalLineItems = [];
        coupon.additionalLineItems.forEach(function (additionalLineItem) {
            var lineItem,
                index;

            index = getLastIndexOfLineItem(order.lineItems,
                additionalLineItem.variantId,
                additionalLineItem.quantity,
                additionalLineItem.catalogCode,
                additionalLineItem.roleCode);

            if (index !== -1) {
                lineItem = order.lineItems.splice(index, 1)[0];
                additionalLineItems.push(lineItem);
            }
        });
        coupon.additionalLineItems = additionalLineItems;
    });
}


Order.calculateOrderQualificationVolume = function (order) {
    var lineItems = order.lineItems,
        orderQV = 0;
    if (!lineItems || !order.lineItems.length) {
        return 0;
    }

    order.lineItems.forEach(function (lineItem) {
        orderQV += utils.roundMoney(lineItem.q_volume || 0);
    });

    return orderQV;
};


Order.getCurrencyOfOrder = function (context, order, callback) {
    if (order.currency) {
        callback(null, order.currency);
        return;
    }

    async.waterfall([
        function (callback) {
            var currencyDao = daos.createDao('Currency', context);
            currencyDao.getCurrencyById(order.currency_id, callback);
        },

        function (currency, callback) {
            order.currency = currency;
            callback(null, currency);
        }
    ], callback);
};

Order.prototype.getRecentOrders = function (userId, offset, limit, callback) {
    var options,
        sqlStmt = '';

    if (!offset) {
        offset = 0;
    }

    if (!limit) {
        limit = 50;
    }

    sqlStmt += " SELECT o.*, c.name AS country_name, (SELECT array_agg(tracking) FROM shipments WHERE order_id=o.id) AS trackings ";
    sqlStmt += " FROM orders AS o";
    sqlStmt += " LEFT JOIN  addresses AS addr ON (addr.id = o.ship_address_id)";
    sqlStmt += " LEFT JOIN countries AS c ON (addr.country_id = c.id)";
    sqlStmt += " WHERE o.user_id= $1 ";
    sqlStmt += " ORDER BY o.order_date DESC";
    sqlStmt += " LIMIT $2 OFFSET $3";

    options = {
        cache : {
            key : cacheKey.recentOrders(userId),
            // TODO: is this expiration time reasonable?
            ttl : 300  // 5 minutes
        },
        sqlStmt: sqlStmt,
        sqlParams: [userId, limit, offset]
    };

    this.queryDatabase(options, function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, result.rows);
    });
};


function fillAdjustmentsIntoOrders(context, orders, callback) {
    async.forEachSeries(orders, function (order, callback) {
        var queryDatabaseOptions = {
                sqlStmt: "SELECT * FROM adjustments WHERE order_id=$1 ORDER BY id;",
                sqlParams: [order.id]
            };

        DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
            if (error) {
                callback(error);
                return;
            }
            order.adjustments = result.rows;
            callback();
        });
    }, function (error) {
        callback(error);
    });
}

/**
 * get the orders of the specified user.
 *  options = {
 *      userId : <Integer> Required.
 *      offset : <Integer> Optional. Default as 0.
 *      limit : <Integer> Optional. Default as 25.
 *  }
 *
 * @method getOrdersOfUser
 * @param options {Object}
 * @param callback {Function}
 */
Order.prototype.getOrdersOfUser = function (options, callback) {
    if (!options.offset) {
        options.offset = 0;
    }

    if (!options.limit) {
        options.limit = 25;
    }

    var context = this.context,
        sqlStmt = '',
        queryDatabaseOptions;

    sqlStmt += " SELECT o.*, c.name AS country_name, (SELECT r.role_code FROM line_items lt LEFT JOIN roles r ON r.id = lt.role_id WHERE lt.order_id =o.id LIMIT 1 ) role_code, (SELECT array_agg(tracking) FROM shipments WHERE order_id=o.id) AS trackings ";
    sqlStmt += " FROM orders AS o";
    sqlStmt += " LEFT JOIN  addresses AS addr ON (addr.id = o.ship_address_id)";
    sqlStmt += " LEFT JOIN countries AS c ON (addr.country_id = c.id)";
    sqlStmt += " WHERE o.user_id= $1 ";
    sqlStmt += " ORDER BY o.order_date DESC";
    sqlStmt += " LIMIT $2 OFFSET $3";

    queryDatabaseOptions = {
        sqlStmt : sqlStmt,
        sqlParams : [options.userId, options.limit, options.offset]
    };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        var orders = result.rows;
        fillAdjustmentsIntoOrders(context, orders, function (error) {
            if (error) {
                callback(error);
                return;
            }

            callback(null, orders);
        });
    });
};


Order.prototype.getOrderCountOfUser = function (userId, callback) {
    var context = this.context,
        sqlStmt = "SELECT count(*) FROM orders WHERE user_id=$1",
        sqlParams = [userId],
        queryDatabaseOptions = {
            sqlStmt : sqlStmt,
            sqlParams : sqlParams
        };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, result.rows[0].count);
    });
};


/*
 *  options = {
 *      lineItems : <Array>,
 *      shippingMethodId : <Integer>,
 *      sihppingAddress : <Object>,
 *      registration : <Boolean>,
 *      userId : <Integer>, required if not registration
 *      validateAddresses : <Boolean>,
 *      autoship : <Boolean>,
 *      additionalAdjustments : <Array> optional. available for admin or when options.autoship is true.
 *  }
 */
Order.prototype.checkoutOrder = function (options, callback) {
    var self = this,
        context = self.context,
        logger = context.logger,
        userDao = daos.createDao('User', context),
        addressDao = daos.createDao('Address', context),
        countryDao = daos.createDao('Country', context),
        items = options.lineItems,
        order = {
            number : uuid.v4(),
            user_id : options.registration ? 0 : options.userId,
            entry_operator : context.user && context.user.userId,
            order_date : new Date(),
            payment_total : 0,
            payment_state : 'balance_due',
            shippingAddressChangeable : true
        },
        error;

    if (!options.registration && !order.user_id) {
        error = new Error('User id is required.');
        error.errorCode = 'InvalidUserId';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (context.config.shoppingServiceDisabled) {
        error = new Error('Shopping service is unavailable.');
        error.errorCode = 'ShoppingServiceUnavailable';
        error.statusCode = 503;
        callback(error);
        return;
    }

    if (!options.lineItems || !options.lineItems.length) {
        error = new Error('Line items are required.');
        error.errorCode = 'InvalidLineItems';
        error.statusCode = 400;
        callback(error);
        return;
    }

    order.autoship = options.autoship;

    async.waterfall([
        function (callback) {
            userDao.getCurrentOperator(function (error, operator) {
                if (error) {
                    callback(error);
                    return;
                }

                order.isAdmin = (!operator) ? false : operator.isAdmin;
                callback();
            });
        },

        function (callback) {
            if (options.registration) {
                // make a fake user
                order.user = {
                    distributor : {
                        id : 0,
                        lifetime_rank : 0
                    },
                    homeAddress : options.homeAddress,
                    shippingAddress : options.shippingAddress,
                    billingAddress : options.billingAddress
                };

                async.waterfall([
                    function (callback) {
                        var roleDao = daos.createDao('Role', context);
                        roleDao.getRoleByCode(options.roleCode, function (error, role) {
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

                            order.user.roles = [role];
                            callback();
                        });
                    },

                    function (callback) {
                        addressDao.fillCountryAndStateOfAddress(order.user.homeAddress, function (error) {
                            callback(error);
                        });
                    },

                    function (callback) {
                        addressDao.fillCountryAndStateOfAddress(order.user.shippingAddress, function (error) {
                            callback(error);
                        });
                    },

                    function (callback) {
                        addressDao.fillCountryAndStateOfAddress(order.user.billingAddress, function (error) {
                            callback(error);
                        });
                    }
                ], callback);

            } else {
                getUserOfOrder(context, order, function (error) {
                    if (error) {
                        callback(error);
                        return;
                    }
                    callback();
                });
            }
        },

        /*
        function (callback) {
            checkPaymentAttemptLimitOfUser(context, order.user, function (error) {
                if (error) {
                    callback(error);
                    return;
                }
                callback();
            });
        },
        */

        function (callback) {
            userDao.getAddressesOfUser(order.user, function (error) {
                callback(error);
            });
        },

        function (callback) {
            // validate shipping address if necessary
            if (!options.shippingAddress || !options.validateAddresses) {
                callback();
                return;
            }

            addressDao.validateShippingAddress(options.shippingAddress, function (error, failures) {
                if (error) {
                    callback(error);
                    return;
                }

                if (failures.length !== 0) {
                    error = new Error('Shipping address is invalid.');
                    error.errorCode = 'InvalidShippingAddresses';
                    error.data = failures;
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            // validate billing address if necessary
            if (!options.billingAddress || !options.validateAddresses) {
                callback();
                return;
            }

            addressDao.validateBillingAddress(options.billingAddress, function (error, failures) {
                if (error) {
                    callback(error);
                    return;
                }

                if (failures.length !== 0) {
                    error = new Error('Billing address is invalid.');
                    error.errorCode = 'InvalidBillingAddresses';
                    error.data = failures;
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            if (options.registration || !options.validateAddresses) {
                callback();
                return;
            }

            var userDao = daos.createDao('User', context);
            userDao.validateProfileAddressesOfUser(order.user, function (error, validateResults) {
                if (error) {
                    callback(error);
                    return;
                }

                if (validateResults.homeAddress || validateResults.billingAddress || validateResults.shippingAddress || validateResults.websiteAddress) {
                    error = new Error('Your profile addresses are invalid.');
                    error.errorCode = 'InvalidProfileAddresses';
                    error.data = validateResults;
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            addCouponAdditionalLineItemsToOrderLineItems(options.coupons, items);
            callback();
        },

        function (callback) {
            getLineItems(context, order.user, items, function (error, lineItems) {
                if (error) {
                    callback(error);
                    return;
                }

                order.lineItems = lineItems;
                order.item_total = getTotalPriceOfLineItems(lineItems);
                order.roleCode = getRoleCodeFromOrder(order);
                callback();
            });
        },

        function (callback) {
            validateLineItems(context, order.user, order.lineItems, callback);
        },

        function (callback) {
            isOrderNoShipping(context, order, function (error, isNoShipping) {
                if (error) {
                    callback(error);
                    return;
                }

                order.isNoShipping = isNoShipping;
                callback();
            });
        },

        function (callback) {
            if (options.shippingAddress) {
                order.shippingAddress = options.shippingAddress;
                callback();
                return;
            }

            // Set the default shipping address
            userDao.getShippingAddressOfUser(order.user, function (error, address) {
                if (error) {
                    callback(error);
                    return;
                }

                order.shippingAddress = address;
                callback();
            });
        },

        function (callback) {
            var countryshipDao = daos.createDao('Countryship', context);
            countryshipDao.canShip(order.user.homeAddress.country_id, order.shippingAddress.country_id, function (error, canShip) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!canShip) {
                    error = new Error('Shipping address is invalid.');
                    error.errorCode = 'InvalidShippingAddress';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }
                callback();
            });
        },

        function (callback) {
            if (options.billingAddress) {
                order.billingAddress = options.billingAddress;
                callback();
                return;
            }

            // Set the default billing address
            userDao.getBillingAddressOfUser(order.user, function (error, address) {
                if (error) {
                    callback(error);
                    return;
                }

                order.billingAddress = address;
                callback();
            });
        },

        function (callback) {
            if (order.isNoShipping) {
                order.availableShippingMethods = [];
                order.shippingAddressChangeable = false;
                callback();
                return;
            }

            getAvailableShippingMethodsOfOrder(context, order, function (error, shippingMethods) {
                if (error) {
                    callback(error);
                    return;
                }

                order.availableShippingMethods = shippingMethods;

                // select a default shipping method if not specified.
                if (!options.shippingMethodId) {
                    if (shippingMethods && shippingMethods.length) {
                        order.shippingMethod = selectDefaultShippingMethod(shippingMethods);
                        order.shipping_method_id = order.shippingMethod.id;
                    }
                    callback();
                    return;
                }

                // otherwise, try using the specified shipping method.
                var shippingMethodDao = daos.createDao('ShippingMethod', context);
                shippingMethodDao.getShippingMethodById(options.shippingMethodId, function (error, shippingMethod) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    // check if options.shippingMethodId is available.
                    isShippingMethodAvailableToOrder(context, order, shippingMethod, function (error, isAvailable) {
                        if (error) {
                            callback(error);
                            return;
                        }
                        if (!isAvailable) {
                            error = new Error("Shpping method id '" + options.shippingMethodId + "' is not available.");
                            error.errorCode = "InvalidShippingMethodId";
                            callback(error);
                            return;
                        }

                        order.shipping_method_id = options.shippingMethodId;
                        order.shippingMethod = shippingMethod;
                        callback();
                    });
                });
            });
        },

        function (callback) {
            // set shipping address as the pick up location if shipping method is pick up
            if (!order.shippingMethod) {
                callback();
                return;
            }

            if (!order.shippingMethod.shippingAddressChangeable) {
                order.shippingAddress = order.shippingMethod.shippingAddresses[0];
                order.shippingAddressChangeable = false;
            }
            callback();
        },

        function (callback) {
            // Get available shipping zone ids
            getZoneIdsOfAddress(context, order.shippingAddress, function (error, zoneIds) {
                if (error) {
                    callback(error);
                    return;
                }

                order.shippingZoneIds = zoneIds;
                callback();
            });
        },

        function (callback) {
            // Set currency_id of order.
            // We use currency used in the shipping address country as the default currency.
            countryDao.getCountryById(order.shippingAddress.country_id, function (error, country) {
                if (error) {
                    callback(error);
                    return;
                }

                order.currency_id = country.currency_id;
                callback();
            });
        },

        function (callback) {
            fireOrderEvent(context, 'checkoutOrder', 'onValidateOptions', options, order, callback);
        },

        function (callback) {
            calculateAdjustmentsOfOrder(context, 'checkoutOrder', options, order, function (error, groupedAdjustments) {
                if (error) {
                    callback(error);
                    return;
                }

                order.adjustments = flattenGroupedOrderAdjustments(groupedAdjustments);
                refreshOrderTotalAndAdjustmentTotal(order);
                callback();
            });
        },

        function (callback) {
            getAvailablePaymentMethodsOfOrder(context, order, function (error, paymentMethods) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!paymentMethods || !paymentMethods.length) {
                    error = new Error('No available payment methods in this country.');
                    error.errorCode = 'NoAvailablePaymentMethods';
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                paymentMethods = rejectGiftCardPaymentMethods(paymentMethods);
                order.availablePaymentMethods = paymentMethods;
                callback();
            });
        },

        function (callback) {
            fireOrderEvent(context, 'checkoutOrder', 'afterCheckout', options, order, callback);
        },

        function (callback) {
            if (options.autoship) {
                order.autoshipItems = order.lineItems;
                delete order.lineItems;
            }

            delete order.number;

            removeCouponAdditionalLineItemsFromOrderLineItems(order, options.coupons);

            callback(null, order);
        }
    ], callback);
};


Order.prototype.getAdjustments = function (options, callback) {
    var self = this,
        context = self.context,
        logger = context.logger,
        addressDao = daos.createDao('Address', context),
        countryDao = daos.createDao('Country', context),
        items = options.lineItems,
        order = {
            number : uuid.v4(),
            user_id : options.registration ? 0 : context.user.userId,
            entry_operator : context.user && context.user.userId,
            order_date : new Date(),
            payment_total : 0,
            payment_state : 'balance_due'
        },
        error;

    if (!options.lineItems || !options.lineItems.length) {
        error = new Error('Line items are required.');
        error.errorCode = 'InvalidLineItems';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!options.shippingMethodId) {
        error = new Error('Shipping method id is required.');
        error.errorCode = 'InvalidShippingMethodId';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!options.shippingAddress) {
        error = new Error('Shipping address is required.');
        error.errorCode = 'InvalidShippingAddress';
        error.statusCode = 400;
        callback(error);
        return;
    }

    async.waterfall([
        function (callback) {
            if (options.registration) {
                // make a fake user
                order.user = {
                    distributor : {
                        id : 0,
                        lifetime_rank : 0
                    },
                    homeAddress : options.homeAddress || options.shippingAddress,
                    shippingAddress : options.shippingAddress,
                    billingAddress : options.billingAddress
                };

                var roleDao = daos.createDao('Role', context);
                roleDao.getRoleByCode(options.roleCode, function (error, role) {
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

                    order.user.roles = [role];
                    callback();
                });

            } else {
                getUserOfOrder(context, order, function (error) {
                    if (error) {
                        callback(error);
                        return;
                    }
                    callback();
                });
            }
        },

        function (callback) {
            getLineItems(context, order.user, items, function (error, lineItems) {
                if (error) {
                    callback(error);
                    return;
                }

                order.lineItems = lineItems;
                order.item_total = getTotalPriceOfLineItems(lineItems);
                callback();
            });
        },

        function (callback) {
            // Validate shipping address
            addressDao.validateShippingAddress(options.shippingAddress, function (error, failures) {
                if (error) {
                    callback(error);
                    return;
                }

                if (failures && failures.length) {
                    error = new Error('Shipping address is invalid.');
                    error.errorCode = 'InvalidShippingAddress';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                order.shippingAddress = options.shippingAddress;
                callback();
            });
        },

        function (callback) {
            if (!options.billingAddress) {
                callback();
                return;
            }

            // Validate billing address
            addressDao.validateBillingAddress(options.billingAddress, function (error, failures) {
                if (error) {
                    callback(error);
                    return;
                }

                if (failures && failures.length) {
                    error = new Error('Billing address is invalid.');
                    error.errorCode = 'InvalidBillingAddress';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                order.billingAddress = options.billingAddress;
                callback();
            });
        },

        function (callback) {
            if (order.isNoShipping) {
                order.availableShippingMethods = [];
                order.shippingAddressChangeable = false;
                callback();
                return;
            }

            getAvailableShippingMethodsOfOrder(context, order, function (error, shippingMethods) {
                if (error) {
                    callback(error);
                    return;
                }

                order.availableShippingMethods = shippingMethods;

                // select a default shipping method if not specified.
                if (!options.shippingMethodId) {
                    if (shippingMethods && shippingMethods.length) {
                        order.shippingMethod = selectDefaultShippingMethod(shippingMethods);
                        order.shipping_method_id = order.shippingMethod.id;
                    }
                    callback();
                    return;
                }

                // otherwise, try using the specified shipping method.
                var shippingMethodDao = daos.createDao('ShippingMethod', context);
                shippingMethodDao.getShippingMethodById(options.shippingMethodId, function (error, shippingMethod) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    // check if options.shippingMethodId is available.
                    isShippingMethodAvailableToOrder(context, order, shippingMethod, function (error, isAvailable) {
                        if (error) {
                            callback(error);
                            return;
                        }
                        if (!isAvailable) {
                            error = new Error("Shpping method id '" + options.shippingMethodId + "' is not available.");
                            error.errorCode = "InvalidShippingMethodId";
                            callback(error);
                            return;
                        }

                        order.shipping_method_id = options.shippingMethodId;
                        order.shippingMethod = shippingMethod;
                        callback();
                    });
                });
            });
        },

        function (callback) {
            // set shipping address as the pick up location if shipping method is pick up
            if (!order.shippingMethod) {
                callback();
                return;
            }

            if (!order.shippingMethod.shippingAddressChangeable) {
                order.shippingAddress = order.shippingMethod.shippingAddresses[0];
                order.shippingAddressChangeable = false;
            }
            callback();
        },

        function (callback) {
            // Get available shipping zone ids
            getZoneIdsOfAddress(context, order.shippingAddress, function (error, zoneIds) {
                if (error) {
                    callback(error);
                    return;
                }

                order.shippingZoneIds = zoneIds;
                callback();
            });
        },

        function (callback) {
            // Set currency_id of order.
            // We use currency used in the shipping address country as the default currency.
            countryDao.getCountryById(order.shippingAddress.country_id, function (error, country) {
                if (error) {
                    callback(error);
                    return;
                }

                order.currency_id = country.currency_id;
                callback();
            });
        },

        function (callback) {
            isOrderNoShipping(context, order, function (error, isNoShipping) {
                if (error) {
                    callback(error);
                    return;
                }

                order.isNoShipping = isNoShipping;
                callback();
            });
        },

        function (callback) {
            calculateAdjustmentsOfOrder(context, 'getAdjustments', options, order, function (error, groupedAdjustments) {
                if (error) {
                    callback(error);
                    return;
                }

                order.adjustments = flattenGroupedOrderAdjustments(groupedAdjustments);
                callback(null, order.adjustments);
            });
        }
    ], callback);
};


/**
 * create an order
 *
 *  options = {
 *      isAutoship : <Boolean> required
 *      autoshipId : <Integer> required if `isAutoship` is true
 *      userId : <Integer> required
 *      lineItems : <Array> required
 *      shippingAddressId : <Integer> required if `shippingAddress` is not provided
 *      shippingAddress : <Object> required if `shippingAddressId` is not provided
 *      billingAddress : <Object> required
 *      shippingMethodId : <Integer> required
 *      paymentMethodId : <Integer> required
 *      creditcard : <Object> required if `paymentMethodId` is a creditcard payment-method id
 *      specialInstructions : <String> optional
 *      dualteamOptions : <Object> optional. dual team options is used for place distributor into dualteam tree when registering
 *      forcedMatrixOptions: <Object> optionals, forced matrix position
 *      additionalAdjustments : <Array> optional. only available for admin.
 *      doNotPay : <Boolean> optional. if this is set as true, we just create the order and will not pay it.
 *      orderDate : <Date> optional
 *      clientRequestId : <String> optional. use to prevent duplicate creating order requests.
 *  }
 * @param options {Object} Options of creating order.
 * @param callback {Function} Callback function.
 */
Order.prototype.createOrder = function (options, callback) {
    var self = this,
        context = self.context,
        logger = context.logger,
        addressDao = daos.createDao('Address', context),
        countryDao = daos.createDao('Country', context),
        userDao = daos.createDao('User', context),
        items = options.lineItems,
        paymentMethodId = options.paymentMethodId,
        paymentMethod,
        order = {
            user_id : options.userId,
            entry_operator : context.user.userId,
            order_date : options.orderDate || new Date(),
            state : 'cart',
            shipment_state : 'pending',
            payment_total : 0,
            payment_state : 'balance_due',
            special_instructions : options.specialInstructions
        },
        error;

    if (!order.user_id) {
        error = new Error('User id is required.');
        error.errorCode = 'InvalidUserId';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!options.isAutoship && context.config.shoppingServiceDisabled) {
        error = new Error('Shopping service is unavailable.');
        error.errorCode = 'ShoppingServiceUnavailable';
        error.statusCode = 503;
        callback(error);
        return;
    }

    if (!options.lineItems || !options.lineItems.length) {
        error = new Error('Line items are required.');
        error.errorCode = 'InvalidLineItems';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (options.shippingMethodId && !options.shippingAddressId && !options.shippingAddress) {
        error = new Error('Shipping address is required.');
        error.errorCode = 'InvalidShippingAddress';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!options.giftCard && !options.paymentMethodId) {
        error = new Error('Payment method id is required.');
        error.errorCode = 'InvalidPaymentMethodId';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (options.isAutoship) {
        order.autoship = true;
        order.autoship_id = options.autoshipId;
    }

    if (options.clientRequestId) {
        order.client_request_id = options.clientRequestId;
    }

    async.waterfall([
        function (callback) {
            var clientIdSecretDao = daos.createDao('ClientIdSecret', context);
            clientIdSecretDao.getClientIdSecretByClientId(context.clientId, function (error, clientIdSecret) {
                if (error) {
                    callback(error);
                    return;
                }

                if (clientIdSecret) {
                    order.source_client_id = clientIdSecret.id;
                }

                callback();
            });
        },

        function (callback) {
            userDao.getCurrentOperator(function (error, operator) {
                if (error) {
                    callback(error);
                    return;
                }

                order.isAdmin = operator.isAdmin;
                callback();
            });
        },

        function (callback) {
            if (!options.eventCode) {
                callback();
                return;
            }

            var orderTypeDao = daos.createDao('OrderType', context);
            orderTypeDao.getOrderTypeByCode('EVT', function (error, orderType) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!orderType) {
                    error = new Error("Order type with code 'EVT' does not exist.");
                    error.errorCode = 'InvalidOrderType';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                order.order_type_id = orderType.id;
                callback();
            });
        },

        function (callback) {
            // Get owner of the order
            userDao.getById(order.user_id, function (error, user) {
                if (error) {
                    callback(error);
                    return;
                }

                order.user = user;
                order.email = user.email;
                callback();
            });
        },

        function (callback) {
            // set order.distributor
            userDao.isDistributor(order.user, function (error, isDistributor) {
                if (error) {
                    callback(error);
                    return;
                }

                order.distributor = isDistributor;
                callback();
            });
        },

        /*
        function (callback) {
            checkPaymentAttemptLimitOfUser(context, order.user, function (error) {
                if (error) {
                    callback(error);
                    return;
                }
                callback();
            });
        },
        */

        function (callback) {
            addCouponAdditionalLineItemsToOrderLineItems(options.coupons, items);
            callback();
        },

        function (callback) {
            // Get price of line items
            getLineItems(context, order.user, items, function (error, lineItems) {
                if (error) {
                    callback(error);
                    return;
                }

                order.lineItems = lineItems;
                order.item_total = getTotalPriceOfLineItems(lineItems);
                order.roleCode = getRoleCodeFromOrder(order);
                callback();
            });
        },

        function (callback) {
            validateLineItems(context, order.user, order.lineItems, callback);
        },

        function (callback) {
            isOrderNoShipping(context, order, function (error, isNoShipping) {
                if (error) {
                    callback(error);
                    return;
                }

                order.isNoShipping = isNoShipping;

                if (order.isNoShipping) {
                    order.shipment_state = null;
                }
                callback();
            });
        },

        function (callback) {
            if (order.isNoShipping) {
                callback();
                return;
            }

            if (!options.shippingMethodId) {
                error = new Error('Shipping method id is required.');
                error.errorCode = 'InvalidShippingMethodId';
                error.statusCode = 400;
                callback(error);
                return;
            }

            var shippingMethodDao = daos.createDao('ShippingMethod', context);
            shippingMethodDao.getShippingMethodById(options.shippingMethodId, function (error, shippingMethod) {
                if (error) {
                    callback(error);
                    return;
                }

                order.shippingMethod = shippingMethod;
                order.shipping_method_id = options.shippingMethodId;
                callback();
            });
        },

        function (callback) {
            // save shipping address of order

            // use pickup location if shipping method is a pickup method
            if (order.shippingMethod && !order.shippingMethod.shippingAddressChangeable) {
                order.shippingAddress = order.shippingMethod.shippingAddresses[0];
                order.ship_address_id = order.shippingAddress.id;

                callback();
                return;
            }

            // use home address of order.user as the shipping address if the order is no need to shipping
            if (order.isNoShipping) {
                userDao.getHomeAddressOfUser(order.user, function (error, address) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!address) {
                        error = new Error("Home address of user is not set.");
                        error.errorCode = 'InvalidShippingAddress';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    order.shippingAddress = address;
                    order.ship_address_id = address.id;
                    callback();
                });
                return;
            }

            // use `options.shippingAddressId` when creating an autoship order
            if (options.isAutoship) {
                addressDao.getAddressById(options.shippingAddressId, function (error, address) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!address) {
                        error = new Error("Address with id " + options.shippingAddressId + " does not exist.");
                        error.errorCode = 'InvalidShippingAddress';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    order.shippingAddress = address;
                    order.ship_address_id = address.id;
                    callback();
                });
                return;
            }

            // use `options.shippingAddress` otherwise
            userDao.getHomeAddressOfUser(order.user, function (error, homeAddress) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!homeAddress) {
                    error = new Error("Home address of user is not set.");
                    error.errorCode = 'InvalidShippingAddress';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                var countryshipDao = daos.createDao('Countryship', context);
                countryshipDao.canShip(homeAddress.country_id, options.shippingAddress.country_id, function (error, canShip) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!canShip) {
                        error = new Error('Shipping address is invalid.');
                        error.errorCode = 'InvalidShippingAddress';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    saveShippingAddressForOrder(context, order, options.shippingAddress, function (error, address) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        order.shippingAddress = address;
                        order.ship_address_id = address.id;
                        callback();
                    });
                });
            });
        },

        function (callback) {
            if (!order.shippingMethod) {
                callback();
                return;
            }

            // check if order.shippingMethod is available.
            isShippingMethodAvailableToOrder(context, order, order.shippingMethod, function (error, isAvailable) {
                if (error) {
                    callback(error);
                    return;
                }
                if (!isAvailable) {
                    error = new Error("Shpping method id '" + options.shippingMethodId + "' is not available.");
                    error.errorCode = "InvalidShippingMethodId";
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            // Get available shipping zone ids
            getZoneIdsOfAddress(context, order.shippingAddress, function (error, zoneIds) {
                if (error) {
                    callback(error);
                    return;
                }

                order.shippingZoneIds = zoneIds;
                callback();
            });
        },

        function (callback) {
            // Set currency_id of order.
            // We use currency used in the shipping address country as the default currency.
            countryDao.getCountryById(order.shippingAddress.country_id, function (error, country) {
                if (error) {
                    callback(error);
                    return;
                }

                order.currency_id = country.currency_id;
                callback();
            });
        },

        function (callback) {
            fireOrderEvent(context, 'createOrder', 'onValidateOptions', options, order, callback);
        },

        function (callback) {
            calculateAdjustmentsOfOrder(context, 'createOrder', options, order, function (error, groupedAdjustments) {
                if (error) {
                    callback(error);
                    return;
                }

                order.shippingAndTaxAdjustments = groupedAdjustments;
                order.adjustments = flattenGroupedOrderAdjustments(groupedAdjustments);
                refreshOrderTotalAndAdjustmentTotal(order);
                callback();
            });
        },

        function (callback) {
            getAvailablePaymentMethodsOfOrder(context, order, function (error, paymentMethods) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!paymentMethods || !paymentMethods.length) {
                    error = new Error('No available payment methods in this country.');
                    error.errorCode = 'NoAvailablePaymentMethods';
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            if (!paymentMethodId) {
                callback();
                return;
            }

            isPaymentMethodAvailableToOrder(context, order, paymentMethodId, function (error, isAvailable) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!isAvailable) {
                    error = new Error("Payment method '" + paymentMethodId + "' is not availble.");
                    error.errorCode = "InvalidPaymentMethodId";
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            if (!paymentMethodId) {
                callback();
                return;
            }

            var paymentMethodDao = daos.createDao('PaymentMethod', context);
            paymentMethodDao.getById(paymentMethodId, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }
                paymentMethod = result;
                callback();
            });
        },

        function (callback) {
            // we don't need billing address when using a non-creditcard payment method.
            if (paymentMethod && !paymentMethod.is_creditcard) {
                callback();
                return;
            }

            // use `options.billingAddressId` when creating an autoship order
            if (options.isAutoship) {
                if (!options.billingAddressId) {
                    error = new Error('Billing address is is required.');
                    error.errorCode = 'InvalidBillingAddress';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                addressDao.getAddressById(options.billingAddressId, function (error, address) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!address) {
                        error = new Error("Address with id " + options.billingAddressId + " does not exist.");
                        error.errorCode = 'InvalidBillingAddress';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    order.billingAddress = address;
                    order.bill_address_id = address.id;
                    callback();
                });
                return;
            }

            //use home address of order.user as the billing address
            //if the order is no need to shipping and don't get billingAddress
            if (order.isNoShipping && !options.billingAddress) {
                userDao.getHomeAddressOfUser(order.user, function (error, address) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!address) {
                        error = new Error("Home address of user is not set.");
                        error.errorCode = 'InvalidBillingAddress';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    order.billingAddress = address;
                    order.bill_address_id = address.id;
                    callback();
                });
                return;
            }

            if (!options.billingAddress) {
                error = new Error('Billing address is required.');
                error.errorCode = 'InvalidBillingAddress';
                error.statusCode = 400;
                callback(error);
                return;
            }

            // Save billing address
            saveBillingAddressForOrder(context, order, options.billingAddress, function (error, address) {
                if (error) {
                    callback(error);
                    return;
                }

                order.billingAddress = address;
                order.bill_address_id = address.id;
                callback();
            });
        },

        function (callback) {
            // Set a temp number. We will change it after insert record to DB.
            order.number = uuid.v4();
            // Save order
            self.models.Order.create(order).success(function (newOrder) {
                newOrder.user = order.user;
                newOrder.lineItems = order.lineItems;
                newOrder.shippingAddress = order.shippingAddress;
                newOrder.shippingZoneIds = order.shippingZoneIds;

                order = newOrder;
                callback();
            }).error(callback);
        },

        function (callback) {
            fireOrderEvent(context, 'createOrder', 'beforeSaveLineItems', options, order, callback);
        },

        function (callback) {
            // Save line items
            saveLineItems(context, order, order.lineItems, function (error, newLineItems) {
                if (error) {
                    callback(error);
                    return;
                }

                order.lineItems = newLineItems;
                callback();
            });
        },

        function (callback) {
            // Update order number
            if (options.isAutoship) {
                updateAutoshipOrderNumber(context, order, callback);
            } else {
                updateRegularOrderNumber(context, order, callback);
            }
        },

        function (callback) {
            // save event-order relation
            if (!options.eventCode) {
                callback();
                return;
            }

            saveEventOrderRelation(context, options.eventCode, order.number, callback);
        },

        function (callback) {
            updateShipmentsAndAdjustmentsOfOrder(context, order, callback);
        },

        function (callback) {
            fireOrderEvent(context, 'createOrder', 'onOrderCreated', options, order, callback);
        }

    ], function (error) {
        if (error) {
            if (order.id) {
                logger.error("Order %d created failed. Rolling back...", order.id);
                deleteOrderById(context, order.id, function () {
                    callback(error);
                });
            } else {
                callback(error);
            }

            return;
        }

        if (options.doNotPay) {
            callback(null, order);
            return;
        }

        // deal with payment
        var paymentData = {
                paymentMethodId : options.paymentMethodId,
                paymentAmount : options.paymentAmount,
                creditcard : options.creditcard,
                giftCard : options.giftCard
            };

        // set autoship payment id when pay an autoship order, so that we can find the creditcard payment token later.
        if (options.isAutoship) {
            paymentData.autoshipPaymentId = options.autoshipPaymentId;
        }

        // dual team options is used for place distributor into dualteam tree when registering.
        order.dualteamOptions = options.dualteamOptions;


        order.forcedMatrixOptions = options.forcedMatrixOptions;

        payOrder(context, order, paymentData, function (error) {
            if (error) {
                logger.error('Payment failed. %s', error.message);

                if (error.errorCode === 'OverFraudPreventionLimit' ||
                        error.errorCode === 'MaxPaymentAttemptExceeded') {
                    callback(error);
                    return;
                }

                order.error = error;
            }

            callback(null, order);
        });
    });
};


/*
 *  options = {
 *      orderId : <Integer> Required.
 *      paymentMethodId : <Integer> Required.
 *      creditcard : <Object> Optional. Required if paymentMethodId is a creditcard payment method id.
 *      giftCard : <Object> Optional.
 *      specialInstructions : <String> Optional.
 *  }
 */
Order.prototype.payOrderById = function (options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        orderId = options.orderId,
        paymentData = {
            paymentMethodId : options.paymentMethodId,
            paymentAmount : options.paymentAmount,
            creditcard : options.creditcard,
            giftCard : options.giftCard
        },
        paymentMethodId = paymentData.paymentMethodId,
        order = null;

    async.waterfall([
        function (callback) {
            self.getById(orderId, function (error, entity) {
                if (error) {
                    if (error.errorCode === 'OrderNotFound') {
                        error.statusCode = 404;
                    }
                    callback(error);
                    return;
                }

                order = entity;
                callback();
            });
        },

        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getCurrentOperator(function (error, operator) {
                if (error) {
                    callback(error);
                    return;
                }

                order.isAdmin = operator.isAdmin;

                if (!operator.isAdmin && order.user_id !== operator.id) {
                    error = new Error("No permission to change order.");
                    error.errorCode = "NoPermissionToChangeOrder";
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (next) {
            // if order has been paid, no need to pay again.
            if (isOrderAlreadyPaid(order)) {
                callback(null, order);
                return;
            }

            next();
        },

        function (callback) {
            getUserOfOrder(context, order, function (error) {
                if (error) {
                    callback(error);
                    return;
                }
                callback();
            });
        },

        /*
        function (callback) {
            checkPaymentAttemptLimitOfUser(context, order.user, function (error) {
                if (error) {
                    callback(error);
                    return;
                }
                callback();
            });
        },
        */

        function (callback) {
            getAddressesOfOrder(context, order, callback);
        },

        function (callback) {
            if (!paymentMethodId) {
                callback();
                return;
            }

            isPaymentMethodAvailableToOrder(context, order, paymentMethodId, function (error, isAvailable) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!isAvailable) {
                    error = new Error("Payment method '" + paymentMethodId + "' is not availble to order '" + order.id + "'");
                    error.errorCode = "InvalidPaymentMethodId";
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            getLineItemsOfOrder(context, order, function (error) {
                callback(error);
            });
        },

        function (callback) {
            if (u.isUndefined(options.specialInstructions)) {
                callback();
                return;
            }

            var queryDatabaseOptions = {
                    useWriteDatabase : true,
                    sqlStmt : "UPDATE orders SET special_instructions = $1 WHERE id = $2",
                    sqlParams : [options.specialInstructions, orderId]
                };
            DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            payOrder(context, order, paymentData, function (error) {
                if (error) {
                    logger.error('Payment failed. %s', error.message);

                    if (error.errorCode === 'OverFraudPreventionLimit' ||
                            error.errorCode === 'MaxPaymentAttemptExceeded') {
                        callback(error);
                        return;
                    }
                }

                callback(null, order);
            });
        }
    ], callback);

};


Order.prototype.cancelOrderById = function (orderId, callback) {
    var self = this,
        context = this.context,
        order = null,
        previousOrderState,
        addressDao = daos.createDao('Address', context);

    async.waterfall([
        function (callback) {
            self.getById(orderId, function (error, entity) {
                if (error) {
                    if (error.errorCode === 'OrderNotFound') {
                        error.statusCode = 404;
                    }
                    callback(error);
                    return;
                }

                order = entity;
                callback();
            });
        },


        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getCurrentOperator(function (error, operator) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!operator.isAdmin && order.user_id !== operator.id) {
                    error = new Error("No permission to change order.");
                    error.errorCode = "NoPermissionToChangeOrder";
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (next) {
            if (order.state === 'cancelled') {
                callback(null, order);
                return;
            }

            var error;

            if (order.state !== 'complete') {
                error = new Error("Can't cancel an uncompleted order.");
                error.errorCode = "NotAllowedToCancelOrder";
                error.statusCode = 403;
                callback(error);
                return;
            }

            if(context.companyCode === 'MMD'){
                next(); //
                return;
            }

            if (order.shipment_state !== 'ready'
                    && order.shipment_state !== 'backorder'
                    && order.shipment_state !== 'pending') {

                if (context.config.application.allowCancelAssembledOrder
                        && order.shipment_state === 'assemble') {
                    next();
                    return;
                }

                error = new Error("Can't cancel a shipped order.");
                error.errorCode = "NotAllowedToCancelOrder";
                error.statusCode = 403;
                callback(error);
                return;
            }

            next();
        },

        function (callback) {
            // TODO: make_shipments_pending
            // TODO: restock_inventory

            previousOrderState = order.state;
            order.state = 'cancelled';
            order.credit_total = order.payment_total;
            order.save(['state', 'credit_total']).done(function (error) {
                callback(error);
            });
        },

        function (callback) {
            // TODO: Avalara.cancel_order_tax
            callback();
        },

        function (callback) {
            var stateEventDao = daos.createDao('StateEvent', context),
                stateEvent = {
                    stateful_id : order.id,
                    stateful_type : 'Order',
                    user_id : (context.user && context.user.userId) || order.user_id,
                    name : 'order',
                    previous_state : previousOrderState,
                    next_state : order.state
                };
            stateEventDao.createStateEvent(stateEvent, function (error, newStateEvent) {
                callback(error);
            });
        }
    ], callback);
};


Order.prototype.getAvailableShippingMethodsByCountryIdAndStateId = function (countryId, stateId, callback) {
    var context = this.context,
        logger = context.logger;

    logger.debug('Getting available shipping methods of {countryId: %d, stateId: %d}', countryId, stateId);
    async.waterfall([
        function (callback) {
            getZoneIdsByCountryIdAndStateId(context, countryId, stateId, function (error, zoneIds) {
                if (error) {
                    callback(error);
                    return;
                }

                logger.debug('zoneIds: %s', zoneIds);
                callback(null, zoneIds);
            });
        },

        function (zoneIds, callback) {
            var shippingMethodDao = daos.createDao('ShippingMethod', context);
            shippingMethodDao.getShippingMethodsInZones(zoneIds, callback);
        }

    ], callback);
};


Order.prototype.getAvailablePaymentMethodsByCountryId = function (countryId, callback) {
    var context = this.context,
        ignoreCreditcardMethods = false,
        isForAdmin = false;

    getAvailablePaymentMethodsByCountryId(context, countryId, ignoreCreditcardMethods, isForAdmin, callback);
};

Order.prototype.getAllAvailablePaymentMethodsByCountryId = function (countryId, callback) {
    var context = this.context;

    getAllAvailablePaymentMethodsByCountryId(context, countryId, callback);
};


Order.prototype.getAvailableAutoshipPaymentMethodsByCountryId = function (countryId, callback) {
    getAvailableAutoshipPaymentMethodsByCountryId(this.context, countryId, callback);
};


Order.prototype.getAvailableHyperwalletPaymentMethodByCountryId = function (countryId, callback) {
    var context = this.context;

    getAllPaymentMethodsByCountryId(context, countryId, function(error, paymentMethods) {
        if (error) {
            callback(error);
            return;
        };

        var i,
            paymentMethod;
        for (i = 0; i < paymentMethods.length; i += 1) {
            paymentMethod = paymentMethods[i];

            if (paymentMethod.name.toLowerCase().indexOf('hyperwallet') !== -1) {
                callback(null, paymentMethod);
                return;
            }
        }

        callback(null, null);
    });
};


Order.prototype.changeOrderBillingAddress = function (orderId, addressData, callback) {
    var self = this,
        context = this.context,
        order = null,
        addressDao = daos.createDao('Address', context);

    async.waterfall([
        function (callback) {
            self.getById(orderId, function (error, entity) {
                if (error) {
                    if (error.errorCode === 'OrderNotFound') {
                        error.statusCode = 404;
                    }
                    callback(error);
                    return;
                }

                order = entity;
                callback();
            });
        },


        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getCurrentOperator(function (error, operator) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!operator.isAdmin && order.user_id !== operator.id) {
                    error = new Error("No permission to change order.");
                    error.errorCode = "NoPermissionToChangeOrder";
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            });
        },


        function (callback) {
            if (order.state === 'complete' &&
                    (order.payment_state === 'paid' || order.payment_state === 'credit_owed')) {
                var error = new Error("Can't change billing address of a paid order.");
                error.errorCode = "NotAllowedToChangeCompletedOrder";
                callback(error);
                return;
            }

            callback();
        },

        function (callback) {
            addressDao.createBillingAddress(addressData, callback);
        },

        function (newAddress, callback) {
            order.bill_address_id = newAddress.id;
            order.save(['bill_address_id']).success(function () {
                callback(null, newAddress);
            }).error(callback);
        }
    ], callback);
};


/*
 *  options = {
 *      orderId : <Integer> required
 *      lineItems : <Array> required
 *  }
 */
Order.prototype.changeOrderLineItems = function (options, callback) {
    var self = this,
        context = this.context,
        orderId = options.orderId,
        order = null,
        error;

    if (!orderId) {
        error = new Error('Order id is required.');
        error.errorCode = 'InvalidOrderId';
        error.statusCode = 400;
        callback(error);
        return;
    }

    async.waterfall([
        function (callback) {
            self.getById(orderId, function (error, entity) {
                if (error) {
                    if (error.errorCode === 'OrderNotFound') {
                        error.statusCode = 404;
                    }
                    callback(error);
                    return;
                }

                order = entity;
                callback();
            });
        },

        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getCurrentOperator(function (error, operator) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!operator.isAdmin && order.user_id !== operator.id) {
                    error = new Error("No permission to change order.");
                    error.errorCode = "NoPermissionToChangeOrder";
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            getPaymentsOfOrder(context, order, function (error, payments) {
                if (error) {
                    callback(error);
                    return;
                }

                order.payments = payments;

                if (!payments || !payments.length) {
                    // no payments, can change line items.
                    callback();
                    return;
                }

                var payment,
                    i;

                for (i = 0; i < payments.length; i += 1) {
                    payment = payments[i];
                    if (payment.state === 'completed') {
                        error = new Error("Can't change line items of an order that has a completed payment.");
                        error.errorCode = "NotAllowedToChangeOrder";
                        callback(error);
                        return;
                    }
                }

                callback();
            });
        },

        function (callback) {
            // remove line item records first
            var lineItemDao = daos.createDao('LineItem', context);
            lineItemDao.deleteLineItemsByOrderId(order.id, callback);
        },

        function (callback) {
            getUserOfOrder(context, order, function (error) {
                callback(error);
            });
        },

        function (callback) {
            getAddressesOfOrder(context, order, function (error) {
                callback(error);
            });
        },

        function (callback) {
            // Get available shipping zone ids
            getZoneIdsOfAddress(context, order.shippingAddress, function (error, zoneIds) {
                if (error) {
                    callback(error);
                    return;
                }

                order.shippingZoneIds = zoneIds;
                callback();
            });
        },

        function (callback) {
            // Get price of line items
            getLineItems(context, order.user, options.lineItems, function (error, lineItems) {
                if (error) {
                    callback(error);
                    return;
                }

                order.lineItems = lineItems;
                callback();
            });
        },

        function (callback) {
            validateLineItems(context, order.user, order.lineItems, callback);
        },

        function (callback) {
            saveLineItems(context, order, order.lineItems, function (error, newLineItems) {
                if (error) {
                    callback(error);
                    return;
                }

                order.lineItems = newLineItems;
                order.item_total = getTotalPriceOfLineItems(order.lineItems);
                order.save(['item_total']).done(function (error) {
                    callback(error);
                });
            });
        },

        function (callback) {
            isOrderNoShipping(context, order, function (error, isNoShipping) {
                if (error) {
                    callback(error);
                    return;
                }

                order.isNoShipping = isNoShipping;
                callback();
            });
        },

        function (callback) {
            calculateAdjustmentsOfOrder(context, 'changeOrderLineItems', options, order, function (error, groupedAdjustments) {
                if (error) {
                    callback(error);
                    return;
                }

                order.shippingAndTaxAdjustments = groupedAdjustments;
                callback();
            });
        },

        function (callback) {
            updateShipmentsAndAdjustmentsOfOrder(context, order, callback);
        },

        function (callback) {
            var paymentTotal = order.payment_total,
                paymentState = 'paid';
            if (paymentTotal < order.total) {
                paymentState = 'balance_due';
            } else if (paymentTotal > order.total) {
                paymentState = 'credit_owed';
            }
            updatePaymentStateOfOrder(context, order, paymentTotal, paymentState, callback);
        }
    ], function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, order);
    });
};
/*
 *  options = {
 *      orderId : <Integer> required
 *      label : <String>
 *      amount : <Float>
 *  }
 */
Order.prototype.addOrderAdjustment = function (options, callback) {
    var self = this,
        context = this.context,
        adjustmentDao = daos.createDao('Adjustment', context),
        orderId = options.orderId,
        order = null,
        error;

    if (!orderId) {
        error = new Error('Order id is required.');
        error.errorCode = 'InvalidOrderId';
        error.statusCode = 400;
        callback(error);
        return;
    }

    async.waterfall([
        function (callback) {
            self.getById(orderId, function (error, entity) {
                if (error) {
                    if (error.errorCode === 'OrderNotFound') {
                        error.statusCode = 404;
                    }
                    callback(error);
                    return;
                }

                order = entity;
                callback();
            });
        },

        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getCurrentOperator(function (error, operator) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!operator.isAdmin && order.user_id !== operator.id) {
                    error = new Error("No permission to change order.");
                    error.errorCode = "NoPermissionToChangeOrder";
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            getUserOfOrder(context, order, function (error) {
                callback(error);
            });
        },

        function (callback) {
            getAddressesOfOrder(context, order, function (error) {
                callback(error);
            });
        },

        function (callback) {
            getLineItemsOfOrder(context, order, function (error) {
                callback(error);
            });
        },

        function (callback) {
            // save adjustment
            var adjustment = {
                    order_id : order.id,
                    source_type : 'Order',
                    source_id : order.id,
                    label : options.label,
                    amount : options.amount
                };

            adjustmentDao.createAdjustment(adjustment, function (error) {
                callback(error);
            });
        },

        function (callback) {
            getAdjustmentsOfOrder(context, order, function (error) {
                callback(error);
            });
        },

        function (callback) {
            refreshOrderTotalAndAdjustmentTotal(order);
            order.save(['total', 'adjustment_total']).success(function () {
                callback();
            }).error(callback);
        },

        function (callback) {
            var paymentTotal = order.payment_total,
                paymentState = 'paid';
            if (paymentTotal < order.total) {
                paymentState = 'balance_due';
            } else if (paymentTotal > order.total) {
                paymentState = 'credit_owed';
            }
            updatePaymentStateOfOrder(context, order, paymentTotal, paymentState, callback);
        }
    ], function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, order);
    });
};


function validateShippingInfoForReadyToShipOrder(context, order, options, callback) {
    var shippingMethodId = options.shippingMethodId,
        shippingAddress = options.shippingAddress,
        originalAdjustments,
        newAdjustments;

    if (!shippingMethodId) {
        shippingMethodId = order.shipping_method_id;
    }

    async.waterfall([
        function (callback) {
            getUserOfOrder(context, order, function (error) {
                callback(error);
            });
        },

        function (callback) {
            getAddressesOfOrder(context, order, callback);
        },

        function (callback) {
            getLineItemsOfOrder(context, order, function (error, lineItems) {
                if (error) {
                    callback(error);
                    return;
                }
                order.lineItems = lineItems;
                callback();
            });
        },

        function (callback) {
            getZoneIdsOfAddress(context, order.shippingAddress, function (error, zoneIds) {
                if (error) {
                    callback(error);
                    return;
                }

                order.shippingZoneIds = zoneIds;
                callback();
            });
        },

        function (callback) {
            // calculate original adjustments
            calculateShippingAndTaxAdjustmentsOfOrder(context, order, function (error, groupedAdjustments) {
                if (error) {
                    callback(error);
                    return;
                }

                originalAdjustments = flattenGroupedOrderAdjustments(groupedAdjustments);
                callback();
            });
        },

        function (callback) {
            var addressDao = daos.createDao('Address', context);
            addressDao.fillCountryAndStateOfAddress(shippingAddress, function (error) {
                callback(error);
            });
        },

        function (callback) {
            // calculate new adjustments
            order.shipping_method_id = shippingMethodId;
            order.shippingAddress = shippingAddress;

            getZoneIdsOfAddress(context, order.shippingAddress, function (error, zoneIds) {
                if (error) {
                    callback(error);
                    return;
                }

                order.shippingZoneIds = zoneIds;
                callback();
            });
        },

        function (callback) {
            calculateShippingAndTaxAdjustmentsOfOrder(context, order, function (error, groupedAdjustment) {
                if (error) {
                    callback(error);
                    return;
                }

                newAdjustments = flattenGroupedOrderAdjustments(groupedAdjustment);
                callback();
            });
        },

        function (callback) {
            var originalShippingAndTaxCost = sumAdjustmentsAmount(originalAdjustments),
                newShippingAndTaxCost = sumAdjustmentsAmount(newAdjustments);

            if (originalShippingAndTaxCost !== newShippingAndTaxCost) {
                var error = new Error("Can not change the given shipping address. Shipping cost and tax amount are not as same as usual.");
                error.statusCode = 409;
                callback(error);
                return;
            }

            callback();
        }
    ], callback);
}


Order.prototype.changeOrderShippingInfo = function (orderId, options, callback) {
    var self = this,
        context = this.context,
        userDao = daos.createDao('User', context),
        shippingMethodId = options.shippingMethodId,
        shippingAddress = options.shippingAddress,
        order = null,
        error;

    if (!options.shippingAddress) {
        error = new Error('Shipping address is required.');
        error.errorCode = 'InvalidShippingAddress';
        error.statusCode = 400;
        callback(error);
        return;
    }

    async.waterfall([
        function (callback) {
            self.getById(orderId, function (error, entity) {
                if (error) {
                    if (error.errorCode === 'OrderNotFound') {
                        error.statusCode = 404;
                    }
                    callback(error);
                    return;
                }

                order = entity;
                callback();
            });
        },

        function (callback) {
            userDao.getCurrentOperator(function (error, operator) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!operator.isAdmin && order.user_id !== operator.id) {
                    error = new Error("No permission to change order.");
                    error.errorCode = "NoPermissionToChangeOrder";
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            if (isOrderAlreadyPaid(order)) {
                if (order.shipment_state === 'ready')
                {
                    validateShippingInfoForReadyToShipOrder(context, order, options, callback);
                    return;
                }

                var error = new Error("Can't change shipping method of a completed order.");
                error.errorCode = "NotAllowedToChangeCompletedOrder";
                callback(error);
                return;
            }

            callback();
        },

        function (callback) {
            if (!shippingMethodId) {
                shippingMethodId = order.shipping_method_id;
            }

            var shippingMethodDao = daos.createDao('ShippingMethod', context);
            shippingMethodDao.getShippingMethodById(shippingMethodId, callback);
        },

        function (shippingMethod, callback) {
            // check if the shippingMethodId is available.
            isShippingMethodAvailableToOrder(context, order, shippingMethod, function (error, isAvailable) {
                if (error) {
                    callback(error);
                    return;
                }
                if (!isAvailable) {
                    error = new Error("Shpping method '" + shippingMethodId + "' is not availble to order '" + orderId + "'");
                    error.errorCode = "ShippingMethodIsNotAvailable";
                    callback(error);
                    return;
                }

                order.shipping_method_id = shippingMethodId;
                order.shippingMethod = shippingMethod;
                callback();
            });
        },

        function (callback) {
            getUserOfOrder(context, order, function (error) {
                callback(error);
            });
        },

        function (callback) {
            if (!order.shippingMethod.shippingAddressChangeable) {
                order.shippingAddress = findAddressInArrayById(order.shippingMethod.shippingAddresses, shippingAddress.id);

                if (!order.shippingAddress) {
                    error = new Error("Shipping address " + shippingAddress.id + " is not available to shipping method " + order.shippingMethod.id);
                    error.errorCode = "InvalidShippingAddress";
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                order.ship_address_id = order.shippingAddress.id;
                callback();
                return;
            }

            userDao.getHomeAddressOfUser(order.user, function (error, homeAddress) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!homeAddress) {
                    error = new Error("Home address of user is not set.");
                    error.errorCode = 'InvalidShippingAddress';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                var countryshipDao = daos.createDao('Countryship', context);
                countryshipDao.canShip(homeAddress.country_id, options.shippingAddress.country_id, function (error, canShip) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!canShip) {
                        error = new Error('Shipping address is invalid.');
                        error.errorCode = 'InvalidShippingAddress';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    saveShippingAddressForOrder(context, order, options.shippingAddress, function (error, address) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        order.shippingAddress = address;
                        order.ship_address_id = address.id;
                        callback();
                    });
                });
            });
        },

        function (callback) {
            order.save(['shipping_method_id', 'ship_address_id']).success(function () {
                callback();
            }).error(callback);
        },

        function (callback) {
            getAddressesOfOrder(context, order, function (error) {
                callback(error);
            });
        },

        function (callback) {
            // Get available shipping zone ids
            getZoneIdsOfAddress(context, order.shippingAddress, function (error, zoneIds) {
                if (error) {
                    callback(error);
                    return;
                }

                order.shippingZoneIds = zoneIds;
                callback();
            });
        },

        function (callback) {
            getLineItemsOfOrder(context, order, function (error) {
                callback(error);
            });
        },

        function (callback) {
            isOrderNoShipping(context, order, function (error, isNoShipping) {
                if (error) {
                    callback(error);
                    return;
                }

                order.isNoShipping = isNoShipping;
                callback();
            });
        },

        function (callback) {
            if (order.shippment_state === 'ready') {
                // no need to change adjustments for a ready-to-ship order.
                callback();
                return;
            }

            calculateAdjustmentsOfOrder(context, 'changeOrderShippingInfo', options, order, function (error, groupedAdjustments) {
                if (error) {
                    callback(error);
                    return;
                }

                order.shippingAndTaxAdjustments = groupedAdjustments;
                updateShipmentsAndAdjustmentsOfOrder(context, order, callback);
            });
        }
    ], function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, {
            shippingMethod : order.shippingMethod,
            shippingAddress : order.shippingAddress
        });
    });
};


Order.prototype.getAvailablePaymentMethodsOfOrder = function (orderId, callback) {
    var self = this,
        context = this.context,
        order = null,
        error;

    async.waterfall([
        function (callback) {
            self.getById(orderId, function (error, entity) {
                if (error) {
                    if (error.errorCode === 'OrderNotFound') {
                        error.statusCode = 404;
                    }
                    callback(error);
                    return;
                }

                order = entity;
                callback();
            });
        },

        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getCurrentOperator(function (error, operator) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!operator.isAdmin && order.user_id !== operator.id) {
                    error = new Error("No permission to get order info.");
                    error.errorCode = "NoPermissionToGetOrder";
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            getAddressesOfOrder(context, order, callback);
        },

        function (callback) {
            getAvailablePaymentMethodsOfOrder(context, order, callback);
        }
    ], callback);
};


Order.prototype.getAddressesOfOrder = function (orderId, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        order = null,
        error;

    async.waterfall([
        function (callback) {
            self.getById(orderId, function (error, entity) {
                if (error) {
                    if (error.errorCode === 'OrderNotFound') {
                        error.statusCode = 404;
                    }
                    callback(error);
                    return;
                }

                order = entity;
                callback();
            });
        },

        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getCurrentOperator(function (error, operator) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!operator.isAdmin && order.user_id !== operator.id) {
                    error = new Error("No permission to get order info.");
                    error.errorCode = "NoPermissionToGetOrder";
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            getAddressesOfOrder(context, order, callback);
        },

        function (callback) {
            callback(null, {
                orderId : order.id,
                billingAddress : order.billingAddress,
                shippingAddress : order.shippingAddress
            });
        }
    ], callback);
};


Order.prototype.getAdjustmentsOfOrder = function (order, callback) {
    getAdjustmentsOfOrder(this.context, order, callback);
};


Order.prototype.getAdjustmentsByOrderId = function (orderId, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        order = null,
        error;

    async.waterfall([
        function (callback) {
            self.getById(orderId, function (error, entity) {
                if (error) {
                    if (error.errorCode === 'OrderNotFound') {
                        error.statusCode = 404;
                    }
                    callback(error);
                    return;
                }

                order = entity;
                callback();
            });
        },

        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getCurrentOperator(function (error, operator) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!operator.isAdmin && order.user_id !== operator.id) {
                    error = new Error("No permission to get order info.");
                    error.errorCode = "NoPermissionToGetOrder";
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            getAdjustmentsOfOrder(context, order, callback);
        }
    ], callback);
};


Order.prototype.getLineItemsOfOrder = function (order, callback) {
    getLineItemsOfOrder(this.context, order, callback);
};


Order.prototype.getLineItemsByOrderId = function (orderId, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        order = null,
        error;

    async.waterfall([
        function (callback) {
            self.getById(orderId, function (error, entity) {
                if (error) {
                    if (error.errorCode === 'OrderNotFound') {
                        error.statusCode = 404;
                    }
                    callback(error);
                    return;
                }

                order = entity;
                callback();
            });
        },

        function (callback) {
            var userDao = daos.createDao('User', context);
            userDao.getCurrentOperator(function (error, operator) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!operator.isAdmin && order.user_id !== operator.id) {
                    error = new Error("No permission to get order info.");
                    error.errorCode = "NoPermissionToGetOrder";
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            getLineItemsOfOrder(context, order, callback);
        },

        function (lineItems, callback) {
            fillShippedAndReturnedQuantityOfLineItems(context, order, lineItems, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, lineItems);
            });
        }
    ], callback);
};


Order.prototype.getOrderInfo = function (orderId, callback) {
    var getOrderDetailsOptions = {
            orderId : orderId
        };
    this.getOrderDetails(getOrderDetailsOptions, callback);
};

/*
 *  options = {
 *      orderId : <Integer> required
 *      orderNumber: <String> optional
 *      skipPermissionCheck : <Boolean> optional, false as default
 *  }
 */
Order.prototype.getOrderDetails = function (options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        orderId = options.orderId,
        order = null,
        error;

    logger.debug("Getting order info of id: %d", orderId);

    async.waterfall([
        function (callback) {
            var cond = { where: {}};

            if(u.isNumber(options.orderId)){
                cond = options.orderId;
            }else if(u.isString(options.orderNumber)){
                cond.where.number= options.orderNumber;
            }else{
                error = new Error('OrderId or OrderNumber is required');
                error.errorCode = 'InvalidIdOrNumber';
                error.statusCode = 400;
                callback(error);
                return;
            }

            // self.getById(orderId, function (error, entity) {
            context.models.Order
            .find(cond)
            .done(function (error, entity) {

                if (error || !entity) {
                    error = new Error("Order not found");
                    error.errorCode = 'OrderNotFound';
                    error.statusCode = 404;
                    callback(error);
                    return;
                }

                order = entity;
                callback();
            });
        },
        //permission check
        // 1. admin can view all orders
        // 2. user can view his own orders
        // 3. distributor can view orders of his down-lines
        // 4. party creator can view orders associated with the party
        function (callback) {
            if (options.skipPermissionCheck) {
                callback();
                return;
            }

            var userDao = daos.createDao('User', context);
            userDao.getCurrentOperator(function (error, operator) {
                if (error) {
                    callback(error);
                    return;
                }

                if (operator.isAdmin || order.user_id === operator.id ) {
                    callback();
                    return;
                }

                var distributorDao = daos.createDao('Distributor', context);
                async.waterfall([
                    function(callback){
                        distributorDao.getDistributorByUserId(order.user_id, function(error, order_distributor){
                            if(error){
                                callback(error);
                                return;
                            }
                            callback(null, order_distributor);
                        });
                    },
                    function(order_distributor, callback){
                        distributorDao.validateParentChildRelationshipUL({
                            parentDistributorId : context.user.distributorId,
                            childDistributorId : order_distributor.id
                        }, function(error, relationship){
                            if(error){
                                callback(error);
                                return;
                            }
                            if(relationship === true){
                                callback();
                                return;
                            }

                            // check if current operator is the party creator
                            isPartyCreatorOfOrder(context, operator, order, function (error, isPartyCreator) {
                                if (error) {
                                    callback(error);
                                    return;
                                }

                                if (isPartyCreator) {
                                    callback();
                                    return;
                                }

                                error = new Error("No permission to get order info.");
                                error.errorCode = "NoPermissionToGetOrder";
                                error.statusCode = 403;
                                callback(error);
                            });
                        });
                    }
                ], callback);

            });
        },

        function (callback) {
            getAddressesOfOrder(context, order, callback);
        },

        function (callback) {
            getLineItemsOfOrder(context, order, function (error, lineItems) {
                if (error) {
                    callback(error);
                    return;
                }
                order.lineItems = lineItems;
                callback();
            });
        },

        function (callback) {
            getAdjustmentsOfOrder(context, order, function (error, adjustments) {
                if (error) {
                    callback(error);
                    return;
                }
                order.adjustments = adjustments;
                callback();
            });
        },

        function (callback) {
            getPaymentsOfOrder(context, order, function (error, payments) {
                if (error) {
                    callback(error);
                    return;
                }
                order.payments = payments;
                callback();
            });
        },

        function (callback) {
            getShipmentsOfOrder(context, order, function (error, shipments) {
                if (error) {
                    callback(error);
                    return;
                }
                order.shipments = shipments;

                var trackingNumbers = [];
                if (order.shipments && order.shipments.length) {
                    order.shipments.forEach(function (shipment) {
                        if (shipment.tracking) {
                            trackingNumbers.push(shipment.tracking);
                        }
                    });
                }
                order.trackings = trackingNumbers.join(',');
                callback();
            });
        },

        function (callback) {
            getAvailableShippingMethodsOfOrder(context, order, function (error, shippingMethods) {
                if (error) {
                    callback(error);
                    return;
                }
                order.availableShippingMethods = shippingMethods;
                callback();
            });
        },

        function (callback) {
            getAvailablePaymentMethodsOfOrder(context, order, function (error, paymentMethods) {
                if (error) {
                    callback(error);
                    return;
                }
                order.availablePaymentMethods = paymentMethods;
                callback();
            });
        },

        function(callback){
            formatOrderForGiftCard(context, order, function(error){
                if (error) {
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            fireOrderEvent(context, 'getOrderDetails', 'onGetOrderDetails', options, order, callback);
        },

        function (callback) {
            logger.debug('Get order info complete.');
            callback(null, order);
        }
    ], callback);
};


/*
 * Validate if an order should allowed.
 * This method will callback an error if not allowed.
 *
 *  options = {
 *      lineItems : {Array},
 *      shippingMethodId : {Integer},
 *      shippingAddress : {Object},
 *      paymentMethodId : {Integer},
 *  }
 */
Order.prototype.validateOrder = function (options, callback) {
    callback();
};


Order.prototype.getDistributorOfOrder = function (order, callback) {
    getDistributorOfOrder(this.context, order, callback);
};


Order.prototype.getUserOfOrder = function (order, callback) {
    getUserOfOrder(this.context, order, callback);
};


Order.prototype.getWarehouseOfOrder = function (order, callback) {
    getWarehouseOfOrder(this.context, order, callback);
};


Order.prototype.getShippingMethodOfOrder = function (order, callback) {
    getShippingMethodOfOrder(this.context, order, callback);
};


Order.prototype.getShipmentsOfOrder = function (order, callback) {
    getShipmentsOfOrder(this.context, order, callback);
};

Order.prototype.deleteOrderById = function (orderId, callback) {
    deleteOrderById(this.context, orderId, callback);
};

Order.prototype.getLineItems = function (user, items, callback) {
    getLineItems(this.context, user, items, callback);
};


Order.prototype.updateOrderState = function (options, callback) {
    var context = this.context,
        order,
        previousOrderState,
        error;

    async.waterfall([
        function (callback) {
            context.models.Order.find(options.orderId).done(function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                order = result;
                if (!order) {
                    error = new Error("Order with id " + options.orderId + " does not exist.");
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (next) {
            if (order.state === options.state) {
                callback();
                return;
            }

            previousOrderState = order.state;
            order.state = options.state;
            order.save(['state']).done(function (error) {
                next(error);
            });
        },

        function (callback) {
            var stateEventDao = daos.createDao('StateEvent', context),
                stateEvent = {
                    stateful_id : order.id,
                    stateful_type : 'Order',
                    user_id : (context.user && context.user.userId) || order.user_id,
                    name : 'order',
                    previous_state : previousOrderState,
                    next_state : order.state
                };
            stateEventDao.createStateEvent(stateEvent, function (error, newStateEvent) {
                callback(error);
            });
        }
    ], callback);
};


Order.prototype.captureOrderPayment = function (options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        paymentDao = daos.createDao('Payment', context),
        order,
        payment,
        error;

    async.waterfall([
        function (callback) {
            context.models.Order.find(options.orderId).done(function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                order = result;

                if (!order) {
                    error = new Error('Order not found.');
                    error.errorCode = 'InvalidOrderId';
                    error.statusCode = 404;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            context.models.Payment.find(options.paymentId).done(function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                payment = result;

                if (!payment) {
                    error = new Error('Payment not found.');
                    error.errorCode = 'InvalidPaymentId';
                    error.statusCode = 404;
                    callback(error);
                    return;
                }

                if (payment.order_id !== order.id) {
                    error = new Error("Payment " + payment.id + " doesn't belong to order " + order.id + ".");
                    error.errorCode = 'InvalidPaymentId';
                    error.statusCode = 404;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (next) {
            if ((order.state === 'complete') &&
                    (order.payment_state === 'paid' ||
                    order.payment_state === 'credit_owed')) {
                callback(null, order);
                return;
            }

            if (payment.state === 'completed') {
                callback(null, order);
                return;
            }

            next();
        },

        function (callback) {
            getUserOfOrder(context, order, function (error) {
                callback(error);
            });
        },

        function (callback) {
            getAddressesOfOrder(context, order, callback);
        },

        function (callback) {
            getLineItemsOfOrder(context, order, function (error, lineItems) {
                if (error) {
                    callback(error);
                    return;
                }
                order.lineItems = lineItems;
                callback();
            });
        },

        function (callback) {
            paymentDao.capturePayment(payment, function (error, payment) {
                var paymentTotal = roundMoney(order.payment_total + payment.amount),
                    paymentState = 'paid';
                if (paymentTotal < order.total) {
                    paymentState = 'balance_due';
                } else if (paymentTotal > order.total) {
                    paymentState = 'credit_owed';
                }
                updatePaymentStateOfOrder(context, order, paymentTotal, paymentState, callback);
            });
        },

        function (callback) {
            tryCompletePaidOrder(context, order, callback);
        },

        function (callback) {
            callback(null, order);
        }
    ], callback);
};



// return authorization functions

/*
 *  options = {
 *      orderId : <Integer>,
 *      amount : <Float>,
 *      lineItems : <Array>,
 *      reason : <String>,
 *  }
 */
Order.prototype.createReturnAuthorization = function (options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        returnAuthorizationDao = daos.createDao('ReturnAuthorization', context),
        returnAuthorization = {
            order_id : options.orderId,
            amount : options.amount,
            reason : options.reason,
            avatax_doccode : null
        },
        order;

    async.waterfall([
        function (callback) {
            self.getById(options.orderId, function (error, entity) {
                if (error) {
                    if (error.errorCode === 'OrderNotFound') {
                        error.statusCode = 404;
                    }
                    callback(error);
                    return;
                }

                order = entity;
                callback();
            });
        },

        function (callback) {
            if (order.shipment_state === 'shipped') {
                callback();
                return;
            }

            var error = new Error("Can't create return authorization. Order has not been shipped.");
            error.errorCode = 'CreateReturnAuthorizationDenied';
            error.statusCode = 403;
            callback(error);
            return;
        },

        function (callback) {
            returnAuthorizationDao.validateReturnAuthorizationLineItems(order.id, options.lineItems, callback);
        },

        function (callback) {
            returnAuthorizationDao.getNextReturnAuthorizationNumberOfOrder(order, function (error, number) {
                if (error) {
                    callback(error);
                    return;
                }

                returnAuthorization.number = number;
                callback();
            });
        },

        function (callback) {
            returnAuthorizationDao.createReturnAuthorization(returnAuthorization, function (error, newReturnAuthorization) {
                if (error) {
                    callback(error);
                    return;
                }

                returnAuthorization = newReturnAuthorization;
                callback();
            });
        },

        function (callback) {
            var inventoryUnitDao = daos.createDao('InventoryUnit', context),
                aquireReturnOptions = {
                    returnAuthorizationId : returnAuthorization.id,
                    orderId : order.id,
                    lineItems : options.lineItems
                };

            inventoryUnitDao.aquireReturn(aquireReturnOptions, function (error) {
                callback(error);
            });
        },

        function (callback) {
            var stateEventDao = daos.createDao('StateEvent', context),
                stateEvent = {
                    stateful_id : order.id,
                    stateful_type : 'Order',
                    user_id : (context.user && context.user.userId) || order.user_id,
                    name : 'return_authorization',
                    previous_state : null,
                    next_state : 'authorized'
                };
            stateEventDao.createStateEvent(stateEvent, function (error, newStateEvent) {
                callback(error);
            });
        },

        function (callback) {
            self.updateOrderState({orderId : options.orderId, state : 'awaiting_return'}, callback);
        },

        function (callback) {
            callback(null, returnAuthorization);
        }
    ], callback);
};


/*
 *  options = {
 *      orderId : <Integer>
 *  }
 */
Order.prototype.refundOrder = function (options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        previousPaymentState,
        order,
        error;

    async.waterfall([
        function (callback) {
            self.getById(options.orderId, function (error, entity) {
                if (error) {
                    if (error.errorCode === 'OrderNotFound') {
                        error.statusCode = 404;
                    }
                    callback(error);
                    return;
                }

                order = entity;
                callback();
            });
        },

        function (callback) {
            if (order.state === 'cancelled') {
                if (order.payment_state !== 'paid' && order.payment_state !== 'credit_owed') {
                    error = new Error("Can't refund order. Order is not paid or credit_owed.");
                    error.errorCode = 'NotAllowedToRefundOrder';
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
                return;
            }

            if (order.state === 'returned') {
                if (order.payment_state !== 'credit_owed') {
                    error = new Error("Can't refund order. Payment state of order is not credit_owed.");
                    error.errorCode = 'NotAllowedToRefundOrder';
                    error.statusCode = 403;
                    callback(error);
                    return;
                }

                callback();
                return;
            }

            error = new Error("Can't refund order. Order is not been cancelled or returned.");
            error.errorCode = 'NotAllowedToRefundOrder';
            error.statusCode = 403;
            callback(error);
        },

        function (callback) {
            previousPaymentState = order.payment_state;
            order.payment_state = 'refund';

            if (order.state === 'cancelled') {
                order.credit_total = order.payment_total;
            } else {
                order.credit_total = roundMoney(order.payment_total - order.total);
            }
            if (order.credit_total < 0) {
                order.credit_total = 0;
            }

            order.save(['payment_state', 'credit_total']).done(function (error) {
                callback(error);
            });
        },

        function (callback) {
            if (previousPaymentState === order.payment_state) {
                callback();
                return;
            }

            var stateEventDao = daos.createDao('StateEvent', context),
                stateEvent = {
                    stateful_id : order.id,
                    stateful_type : 'Order',
                    user_id : (context.user && context.user.userId) || order.user_id,
                    name : 'payment',
                    previous_state : previousPaymentState,
                    next_state : order.payment_state
                };
            stateEventDao.createStateEvent(stateEvent, function (error, newStateEvent) {
                callback(error);
            });
        },

        function (callback) {
            callback(null, order);
        }
    ], callback);
};


function getPaidOrdersDetailsByOrderBatch(context, orderBatch, callback) {
    var logger = context.logger;

    logger.debug("Getting details of paid orders...");
    async.waterfall([
        function (callback) {
            var queryDatabaseOptions = {
                    sqlStmt : "SELECT * FROM orders WHERE state = 'complete' AND (payment_state = 'paid' OR payment_state = 'credit_owed') AND shipping_method_id IS NOT NULL AND updated_at >= $1 AND updated_at < $2",
                    sqlParams : [orderBatch.start_date, orderBatch.end_date]
                };

            DAO.queryDatabase(context, queryDatabaseOptions, callback);
        },

        function (result, callback) {
            callback(null, result.rows);
        },

        function (orders, callback) {
            async.forEachSeries(orders, function (order, callback) {
                async.waterfall([
                    function (callback) {
                        var currencyDao = daos.createDao('Currency', context);
                        currencyDao.getCurrencyById(order.currency_id, function (error, currency) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            order.currency = currency;
                            callback();
                        });

                    },
                    function (callback) {
                        getLineItemsOfOrder(context, order, function (error, lineItems) {
                            if (error) {
                                callback(error);
                                return;
                            }
                            order.lineItems = lineItems;
                            callback();
                        });
                    },

                    function (callback) {
                        getAdjustmentsOfOrder(context, order, function (error, adjustments) {
                            if (error) {
                                callback(error);
                                return;
                            }
                            order.adjustments = adjustments;
                            callback();
                        });
                    },

                    function (callback) {
                        getShippingMethodOfOrder(context, order, function (error, shippingMethod) {
                            if (error) {
                                callback(error);
                                return;
                            }
                            order.shippingMethod = shippingMethod;
                            callback();
                        });
                    },

                    function (callback) {
                        var addressDao = daos.createDao('Address', context);
                        addressDao.getAddressInfo(order.ship_address_id, function (error, address) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            order.shippingAddress = address;
                            callback();
                        });
                    }
                ], callback);
            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, orders);
            });
        }
    ], callback);
}


Order.prototype.getCurrentPaidOrdersDetailsBatch = function (callback) {
    var context = this.context,
        orderBatch;

    async.waterfall([
        function (callback) {
            var orderBatchDao = daos.createDao('OrderBatch', context);
            orderBatchDao.newOrderBatch(callback);
        },

        function (result, callback) {
            orderBatch = result;
            getPaidOrdersDetailsByOrderBatch(context, orderBatch, callback);
        },

        function (orders, callback) {
            orderBatch.orders = orders;
            callback(null, orderBatch);
        }
    ], callback);
};


Order.prototype.getPaidOrdersDetailsByOrderBatchId = function (orderBatchId, callback) {
    var context = this.context,
        orderBatch;

    async.waterfall([
        function (callback) {
            var orderBatchDao = daos.createDao('OrderBatch', context);
            orderBatchDao.getById(orderBatchId, callback);
        },

        function (result, callback) {
            orderBatch = result;
            getPaidOrdersDetailsByOrderBatch(context, orderBatch, callback);
        },

        function (orders, callback) {
            orderBatch.orders = orders;
            callback(null, orderBatch);
        }
    ], callback);
};


Order.prototype.hasCompletedOrderByUserId = function (userId, callback) {
    var context = this.context,
        queryDatabaseOptions = {
            sqlStmt : "select * from orders where state = 'complete' and user_id = $1 limit 1",
            sqlParams : [userId]
        };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, !!result.rows.length);
    });
};


Order.prototype.getOrdersByEventCode = function (eventCode, callback) {
    var self = this,
        context = this.context,
        logger = context.logger;


    logger.debug("Getting orders of event with code '%s'", eventCode);
    async.waterfall([
        function (callback) {
            var queryDatabaseOptions = {
                    sqlStmt : "SELECT o.id FROM events_orders eo INNER JOIN orders o ON eo.order_number = o.number WHERE eo.event_code = $1",
                    sqlParams : [eventCode]
                };

            DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                var orderIds = result.rows.map(function (row) {
                    return row.id;
                });
                callback(null, orderIds);
            });
        },

        function (orderIds, callback) {
            if (orderIds.length) {
                logger.debug("%d orders found. Getting details of these orders.", orderIds.length);
            } else {
                logger.debug("No orders found.");
            }

            var orders = [];
            async.forEachSeries(orderIds, function (orderId, callback) {
                var getOrderDetailsOptions = {
                        orderId : orderId,
                        skipPermissionCheck : true
                    };
                self.getOrderDetails(getOrderDetailsOptions, function (error, order) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    orders.push(order);
                    callback();
                });
            }, function (error) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, orders);
            });
        }
    ], callback);
};

Order.prototype.getPersonalSponsoredOrdersByMonth = function (input, callback) {
    var date = input.date,
        limit = input.limit,
        offset = input.offset,
        roleCode = input.roleCode,
        distributorId = input.distributorId,
        options,
        sqlStmt;

    sqlStmt =  "SELECT distributor_id,full_name,order_info FROM mobile.get_report_organization_UL2($1, $2, $3, $4, $5) WHERE child_level = 1 AND role_code = $6 ORDER BY child_level, role_code, distributor_id";

    options = {
        cache : {
            key : 'getPersonalSponsoredOrdersByMonth_' + date + '_' + offset + '_' + limit + '_' + distributorId,
            ttl : 60 * 15 // 15 minutes
        },
    sqlStmt: sqlStmt,
        sqlParams: [distributorId, date, limit, offset, 1, roleCode]
    };

    this.queryDatabase(options, callback);
};

Order.prototype.getPersonalSponsoredOrdersByMonthCount = function (input, callback) {
    var date = input.date,
        limit = input.limit,
        offset = input.offset,
        roleCode = input.roleCode,
        distributorId = input.distributorId,
        options,
        sqlStmt;

    sqlStmt =  "SELECT count(*) FROM mobile.get_report_organization_UL2($1, $2, null, null, $3) WHERE child_level = 1 AND role_code = $4";

    options = {
        cache : {
            key : 'getPersonalSponsoredOrdersByMonth_count_' + date + '_' + offset + '_' + limit + '_' + distributorId,
            ttl : 60 * 15 // 15 minutes
        },
    sqlStmt: sqlStmt,
        sqlParams: [distributorId, date, 1, roleCode]
    };

    this.queryDatabase(options, callback);
};

Order.prototype.getCountryByOrderId = function (id, callback) {
    var options,
        sqlStmt;

    sqlStmt =  "select c.* from orders o join addresses a on o.ship_address_id=a.id join countries c on c.id=a.country_id where o.id = $1";

    options = {
        cache : {
            key : 'getCountryByOrderId_' + id,
            ttl : 60 * 15 // 15 minutes
        },
    sqlStmt: sqlStmt,
        sqlParams: [id]
    };

    this.queryDatabase(options, callback);
};


Order.prototype.existsOrderByClientRequestId = function (clientRequestId, callback) {
    var context = this.context;

    context.readModels.Order.find({
        where : {client_request_id : clientRequestId}
    }).done(function (error, order) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, !!order);
    });
};

module.exports = Order;

sidedoor.expose(module, 'privateAPIes', {
    getZoneIdsOfAddress : getZoneIdsOfAddress,
    getAvailableShippingMethodsOfOrder : getAvailableShippingMethodsOfOrder,
    isShippingMethodAvailableToOrder : isShippingMethodAvailableToOrder,
    getLineItems : getLineItems,
    validateLineItemsForSystemKit : validateLineItemsForSystemKit,
    validateLineItemsForPromotional : validateLineItemsForPromotional,
    generateOrderNumber : generateOrderNumber,
    getTotalPriceOfLineItems : getTotalPriceOfLineItems,
    getCountriesOfLineItem : getCountriesOfLineItem,
    saveLineItems : saveLineItems,
    getLineItemsOfOrder : getLineItemsOfOrder,
    calculateAdjustmentsOfOrderViaCalculator : calculateAdjustmentsOfOrderViaCalculator,
    updateNextRenewalDateIfNecessary : updateNextRenewalDateIfNecessary,
    deleteProductCatalogCacheIfNecessary : deleteProductCatalogCacheIfNecessary,
    getAddressesOfOrder : getAddressesOfOrder,
    getAvailableCreditcardPaymentMethod : getAvailableCreditcardPaymentMethod,
    getAvailableNoCreditcardPaymentMethods : getAvailableNoCreditcardPaymentMethods,
    getAvailablePaymentMethodsOfOrder : getAvailablePaymentMethodsOfOrder,
    getPaymentGatewayAddressOfOrder : getPaymentGatewayAddressOfOrder,
    payOrder : payOrder,
    deleteOrderById : deleteOrderById,
    sendConfirmMailOfOrder : sendConfirmMailOfOrder,
    completeDistributorRegistration: completeDistributorRegistration
});

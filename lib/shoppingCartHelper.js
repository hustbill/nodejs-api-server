var async = require('async');
var _ = require('underscore');
var daos = require('../daos');

/*
 *  options = {
 *      context: <object> required,
 *      lineItems : <string> required
 *  }
 */
var validateLineItems = function(options, callback){
    var context = options.context;
    var logger = context.logger;
    var lineItems = options.lineItems;
    var error;

    if(_.isArray(lineItems)){
        for(var i = 0; i< lineItems.length; i++){
            var item = lineItems[i];

            //
            if(!_.isNumber(item.quantity) || item.quantity < 0){
                error = new Error("quantity of line-item must be an positive number.");
                error.statusCode = 400;
                callback(error);
                return;
            }
        }

        callback();
        return;
    }

    callback();

};

/*
 *  options = {
 *      context: <object> required,
 *      variantId : <integer> required,
 *      catalogCode : <string> required,
 *      userId : <string>  optional
 *      roleCode : <string> optional. required if userId is not provided.
 *  }
 */
var checkLineItem = function(options, callback){
    var context = options.context;
    var config = context.config;
    var logger = context.logger;
    var variantDao = daos.createDao('Variant', context);

    var error = null;

    if(!options.catalogCode && config  && config.application && config.application.shoppingCartSettings){
        options.catalogCode = config.application.shoppingCartSettings.defaultCatalogCode;
    }

    var variantCallback =function(error, variant){
        if(error){
            callback(error);
            return;
        }

        callback(null, variant);
    };

    //TODO from cache
//    logger.log("options:%j", options);

    if(options.userId){
        variantDao.getVariantDetailForUser(options, variantCallback);
    } else if(options.roleCode){
        variantDao.getVariantDetailForRole(options, variantCallback);
    }else{
        error = new Error("userId or roleCode  required.");
        error.errorCode = 'InvalidOption';
        error.statusCode = 400;
        callback(error);
    }

};


function getRoleCode(context, item){
    var config = context.config;
    var logger = context.logger;

    // from item
    if(item['role-code']){
        return item['role-code'];
    } 

    //from config
    if(config  && config.application && config.application.shoppingCartSettings) {
        return config.application.shoppingCartSettings.defaultRoleCode;
    }

    return null;
}

/*
 *  options = {
 *      context: <object> required,
 *      shoppingCart : <object> required,
 *      userId : <string>  optional
 *      variantId : <integer> optional, required if userId is not provided.
 *      roleCode : <string> optional, required if userId is not provided.
 *  }
 */
var checkShoppingCart = function(options, callback){
    var context = options.context;
    var logger = context.logger;
    var config = context.config;
    var shoppingCart = options.shoppingCart;

    if (shoppingCart && _.isArray(shoppingCart['line-items']) && shoppingCart['line-items'].length > 0) {
        var items = [];
        async.each(
            shoppingCart['line-items'],
            function (item, callback2) {

                //default
                if(!item['catalog-code'] && config && config.application && config.application.shoppingCartSettings){
                    item['catalog-code'] = config.application.shoppingCartSettings.defaultCatalogCode;
                }

                options.variantId = item['variant-id'];
                options.catalogCode = item['catalog-code'];

                if(!options.userId && !options.roleCode){
                    options.roleCode = getRoleCode(context, item);
                }

                logger.debug("query options:%j", {
                    visitorId: options.visitorId,
                    catalogCode: options.catalogCode,
                    roleCode: options.roleCode,
                    userId: options.userId
                });

                checkLineItem(options, function (error, result) {
                    logger.debug("query result:%j, error:%j ", result, error);
                    if (!error) {
                        items.push(item);
                    }
                    callback2(null);
                });
            },
            function (error) {
                shoppingCart['line-items'] = items;
                callback(null, shoppingCart);
            });

    } else {
        callback(null, shoppingCart);
    }
};

function comparePersonalizedValues(items, items2){

    for (var i = 0; i < items.length; i += 1){
        var item = items[i];
        if(!_.find(items2, function(item2){return _.isEqual(item, item2);})){
            return false;
        }
    }

    return true; 
}

function getLineItemFromArray(lineItems, modification) {
    var lineItem,
        i;

    var variantId = modification['variant-id'];

    for (i = 0; i < lineItems.length; i += 1) {
        lineItem = lineItems[i];
        if (lineItem['variant-id'] === variantId) {

            var pValues = lineItem['personalized-values'];
            var pValues2 = modification['personalized-values'];

            //
            if(!pValues && !pValues2){
                return lineItem;
            }

            //
            if(!pValues || !pValues2){
                return null;
            }

            //
            if(comparePersonalizedValues(pValues, pValues2)){
                return lineItem;
            }

            return null;
        }
    }

    return null;
};

var modifyLineItems = function (lineItems, modifications) {
    var newLineItems = [];

    if (!lineItems) {
        lineItems = [];
    }

    if (!modifications || !modifications.length) {
        return lineItems;
    }


    modifications.forEach(function (eachModification) {
        var lineItem = getLineItemFromArray(lineItems, eachModification);
        if (!lineItem) {
            lineItem = eachModification;
            newLineItems.push(lineItem);
        } else {
            lineItem.quantity += eachModification.quantity;
        }

        if (lineItem.quantity < 0) {
            lineItem.quantity = 0;
        }
    });

    return lineItems.concat(newLineItems);
};


exports.validateLineItems = validateLineItems;
exports.checkLineItem = checkLineItem;
exports.checkShoppingCart = checkShoppingCart;
exports.modifyLineItems = modifyLineItems;




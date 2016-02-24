/**
 * ShippingCategory DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var LazyLoader = require('../lib/lazyLoader');

var shippingCategoriesLoader = null;
var shippingCategoriesMapById = null;


function ShippingCategory(context) {
    DAO.call(this, context);
}

util.inherits(ShippingCategory, DAO);


function loadShippingCategories(context, callback) {
    if (!shippingCategoriesLoader) {
        shippingCategoriesLoader = new LazyLoader();
    }

    shippingCategoriesLoader.load(
        function (callback) {
            context.readModels.ShippingCategory.findAll().success(function (calculatorEntities) {
                callback(null, calculatorEntities);
            }).error(callback);
        },

        function (error, shippingCategories) {
            if (error) {
                callback(error);
                return;
            }

            if (!shippingCategoriesMapById) {
                shippingCategoriesMapById = {};
                shippingCategories.forEach(function (eachShippingCategory) {
                    shippingCategoriesMapById[eachShippingCategory.id] = eachShippingCategory;
                });
            }

            callback(null, shippingCategories);
        }
    );
}


ShippingCategory.prototype.getAllShippingCategories = function (callback) {
    loadShippingCategories(this.context, callback);
};


ShippingCategory.prototype.getShippingCategoryById = function (shippingCategoryId, callback) {
    var context = this.context;

    async.waterfall([
        function (callback) {
            loadShippingCategories(context, callback);
        },

        function (shippingCategories, callback) {
            var shippingCategory = shippingCategoriesMapById[shippingCategoryId];
            if (!shippingCategory) {
                callback(null, null);
                return;
            }
            callback(null, shippingCategory);
        }
    ], callback);
};


module.exports = ShippingCategory;

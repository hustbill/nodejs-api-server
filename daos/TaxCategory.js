/**
 * TaxCategory DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var LazyLoader = require('../lib/lazyLoader');

var taxCategoriesLoader = null;
var taxCategoriesMapById = null;


function TaxCategory(context) {
    DAO.call(this, context);
}

util.inherits(TaxCategory, DAO);


function loadTaxCategories(context, callback) {
    if (!taxCategoriesLoader) {
        taxCategoriesLoader = new LazyLoader();
    }

    taxCategoriesLoader.load(
        function (callback) {
            context.readModels.TaxCategory.findAll().success(function (calculatorEntities) {
                callback(null, calculatorEntities);
            }).error(callback);
        },

        function (error, taxCategories) {
            if (error) {
                callback(error);
                return;
            }

            if (!taxCategoriesMapById) {
                taxCategoriesMapById = {};
                taxCategories.forEach(function (eachTaxCategory) {
                    taxCategoriesMapById[eachTaxCategory.id] = eachTaxCategory;
                });
            }

            callback(null, taxCategories);
        }
    );
}


TaxCategory.prototype.getAllTaxCategories = function (callback) {
    loadTaxCategories(this.context, callback);
};


TaxCategory.prototype.getTaxCategoryById = function (taxCategoryId, callback) {
    var context = this.context;

    async.waterfall([
        function (callback) {
            loadTaxCategories(context, callback);
        },

        function (taxCategories, callback) {
            var taxCategory = taxCategoriesMapById[taxCategoryId];
            if (!taxCategory) {
                callback(null, null);
                return;
            }
            callback(null, taxCategory);
        }
    ], callback);
};


module.exports = TaxCategory;

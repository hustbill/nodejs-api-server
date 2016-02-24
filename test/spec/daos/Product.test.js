/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var rewire = require('rewire');
var async = require('async');
var testUtil = require('../../testUtil');
var util = require('util');
var sidedoor = require('sidedoor');
var mapper = require('../../../mapper');
var UserDao = require('../../../daos/User');

var sutPath = '../../../daos/Product.js';
var ProductDao = rewire(sutPath);
var privateAPIes = sidedoor.get(sutPath, 'privateAPIes');


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        user : true
    }, callback);
}


describe('daos/Product', function () {
    describe('ftoFilterFoundingHandlerRenewalProducts', function () {
        it("use products that have 'founding-handler-renewal' property if use is founding distributor", function (done) {
            var context,
                products = [
                    {id : 398, taxon_id : 2, }, // regular
                    {id : 399, taxon_id : 2, }  // founding
                ];

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;
                    context.config.application['fto-latest-founding-distributor-id'] = 9000000;
                    var user = {id : 10001};

                    ProductDao.__get__("ftoFilterFoundingHandlerRenewalProducts")(context, user, products, callback);
                },

                function (filteredProducts, callback) {
                    console.log(filteredProducts);
                    expect(filteredProducts).to.eql([products[1]]);
                    callback();
                }
            ], done);
        });

        it("use products that have no 'founding-handler-renewal' property if use is not founding distributor", function (done) {
            var context,
                products = [
                    {id : 398, taxon_id : 2, }, // regular
                    {id : 399, taxon_id : 2, }  // founding
                ];

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;
                    context.config.application['fto-latest-founding-distributor-id'] = 1;
                    var user = {id : 10001};

                    ProductDao.__get__("ftoFilterFoundingHandlerRenewalProducts")(context, user, products, callback);
                },

                function (filteredProducts, callback) {
                    console.log(filteredProducts);
                    expect(filteredProducts).to.eql([products[0]]);
                    callback();
                }
            ], done);
        });
    });

    describe("daos/getProductsForUser", function () {
        it("should work", function (done) {
            var options,
                context,
                userDao,
                user;
                options = {
                    roleCode : "R",
                    catalogCode : "SP",
                    sortBy : "name",
                    sku : "018308US",
                    offset: 0,
                    limit: 2,
                    userId: null,
                    countryId: null
                };

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;
                    options.userId = context.user.userId;
                    userDao = new UserDao(context);
                    userDao.getById(context.user.userId, callback);
                },

                function (result, callback) {
                    user = result;
                    userDao.getCountryOfUser(user, callback);
                },

                function (soldAddress, callback) {
                    options.countryId = soldAddress.country_id;
                    productDao = new ProductDao(context);
                    productDao.getProductsForUser(options, function(error, products, meta){
                        // console.log(JSON.stringify({products: products, meta: meta}));
                        callback(error);
                    });
                }
            ], done);
        });
    });

    describe("daos/getProductsForRole", function () {
        it("should work", function (done) {
            var options,
                context,
                userDao,
                user;
                options = {
                    roleCode : "R",
                    catalogCode : "SP",
                    sortBy : "name",
                    sku : "018308us",
                    offset: 0,
                    limit: 2,
                    userId: null,
                    countryId: null
                };

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;
                    options.userId = context.user.userId;
                    userDao = new UserDao(context);
                    userDao.getById(context.user.userId, callback);
                },

                function (result, callback) {
                    user = result;
                    userDao.getCountryOfUser(user, callback);
                },

                function (soldAddress, callback) {
                    options.countryId = soldAddress.states[0].country_id;
                    productDao = new ProductDao(context);
                    productDao.getProductsForRole(options, function(error, products, meta){
                        // console.log(JSON.stringify({products: products, meta: meta}));
                        callback(error);
                    });
                }
            ], done);
        });
    });
});


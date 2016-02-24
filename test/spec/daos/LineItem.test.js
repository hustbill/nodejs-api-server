/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var util = require('util');

var sutPath = '../../../daos/LineItem.js';
var LineItemDao = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        redis : true,
        user : true
    }, callback);
}


describe('daos/LineItem', function () {
    describe('getNonFreeShippingItems()', function () {
        it('should callback non free shipping items', function (done) {
            var context,
                user,
                lineItems = [
                    { variantId : 24, quantity : 1, catalogCode : 'RG' },
                    { variantId : 34, quantity : 2, catalogCode : 'RG' },
                    { variantId : 14, quantity : 1, catalogCode : 'RG' }
                ];

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    context.readModels.User.find(context.user.userId).done(callback);
                },

                function (user, callback) {
                    var lineItemDao = new LineItemDao(context);
                    lineItemDao.getNonFreeShippingItems(user, lineItems, callback);
                },

                function (nonFreeShippingItems, callback) {
                    var lineItemsExpected = [
                        { variantId : 24, quantity : 1, catalogCode : 'RG' },
                        { variantId : 34, quantity : 2, catalogCode : 'RG' }
                    ];

                    expect(nonFreeShippingItems.map(function (item) {
                        return {
                            variantId : item.variantId,
                            quantity : item.quantity,
                            catalogCode : item.catalogCode
                        };
                    })).to.eql(lineItemsExpected);

                    callback();
                }
            ], done);
        });
    });

    describe('getNonFreeShippingItemsCount()', function () {
        it('should callback count of non free shipping items', function (done) {
            var context,
                user,
                lineItems = [
                    { variantId : 24, quantity : 1, catalogCode : 'RG' },
                    { variantId : 34, quantity : 2, catalogCode : 'RG' },
                    { variantId : 14, quantity : 1, catalogCode : 'RG' }
                ];

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    context.readModels.User.find(context.user.userId).done(callback);
                },

                function (user, callback) {
                    var lineItemDao = new LineItemDao(context);
                    lineItemDao.getNonFreeShippingItemsCount(user, lineItems, callback);
                },

                function (count, callback) {
                    expect(count).to.equal(3);

                    callback();
                }
            ], done);
        });
    });
});


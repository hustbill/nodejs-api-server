/*global describe, it */
/*jshint expr:true */

var rewire = require('rewire');
var expect = require('chai').expect;
var async = require('async');
var daos = require('../../../daos');
var testUtil = require('../../testUtil');
var couponHelper = require('../../helpers/couponHelper');
var mapper = require('../../../mapper');

var suitPath = '../../../lib/orderPlugins/discountAdjustment.js';
var DiscountAdjustmentPlugin = rewire(suitPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        redis : true,
        user : true
    }, callback);
}

describe('lib/orderPlugins/coupon', function () {
    describe('onCalculateAdjustments()', function () {
        it('should work', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    context.companyCode = 'WNP';
                    context.user.userId = 10001;

                    var options = {},
                        order = {
                            id : 23,
                            user_id : context.user.userId,
                            lineItems : [
                                {
                                    variant : {can_discount : true},
                                    price : 500,
                                    quantity : 1,
                                    q_volume : 300,
                                    role_code : 'D'}
                            ]
                        };
                    DiscountAdjustmentPlugin.onCalculateAdjustments(context, 'checkoutOrder', options, order, function (error) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        console.log(order.groupedAdjustments.discount);
                        expect(order.groupedAdjustments.discount).to.be.ok;
                        callback();
                    });
                }
            ], done);
        });
    });
});

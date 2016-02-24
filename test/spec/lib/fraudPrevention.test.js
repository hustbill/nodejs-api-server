/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var util = require('util');
var daos = require('../../../daos/index');

var sutPath = '../../../lib/fraudPrevention.js';
var fraudPrevention = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        extend : {
            user : {userId : 13455}
        }
    }, callback);
}


describe('lib/fraudPrevention', function () {
    describe('isPaymentAllowed()', function () {
        it('should callback true if purchase is allowded', function (done) {
            var context,
                orderId = testUtil.getTestOrderIdOfNormal(),
                order,
                payment;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var orderDao = daos.createDao('Order', context);
                    orderDao.getOrderInfo(orderId, callback);
                },

                function (result, callback) {
                    order = result;
                    var userDao = daos.createDao('User', context);
                    userDao.getById(order.user_id, callback);
                },

                function (result, callback) {
                    order.user = result;

                    payment = {
                        order_id : order.id,
                        amount : order.total
                    };
                    fraudPrevention.isPaymentAllowed(context, order, payment, callback);
                },

                function (isAllowed, callback) {
                    expect(isAllowed).to.equal(true);

                    callback();
                }
            ], done);
        });
    });

    describe('isPurchaseAllowedForRegistration()', function () {
        it('should callback true if purchase is allowded', function (done) {
            var context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    options = {
                        countryIso : 'US',
                        orderAmount : 100
                    };
                    fraudPrevention.isPurchaseAllowedForRegistration(context, options, callback);
                },

                function (isAllowed, callback) {
                    expect(isAllowed).to.equal(true);

                    callback();
                }
            ], done);
        });
    });

});


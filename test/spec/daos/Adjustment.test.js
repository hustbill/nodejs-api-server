/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var util = require('util');

var sutPath = '../../../daos/Adjustment.js';
var AdjustmentDao = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : true,
        database : true
    }, callback);
}


describe('daos/Adjustment', function () {
    describe('clearTaxRateAdjustmentsOfOrder()', function () {
        it('should work', function (done) {
            var context,
                orderId = 1;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var adjustmentDao = new AdjustmentDao(context);
                    adjustmentDao.clearTaxRateAdjustmentsOfOrder(orderId, callback);
                },

                function (callback) {
                    callback();
                }
            ], done);
        });
    });
});


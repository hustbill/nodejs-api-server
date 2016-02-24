/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var util = require('util');

var sutPath = '../../../daos/ClientFXRate.js';
var ClientFXRateDao = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true
    }, callback);
}


describe('daos/ClientFXRateDao', function () {
    describe('getConvertRateOfCurrency()', function () {
        it('should work', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var clientFXRateDao = new ClientFXRateDao(context);
                    clientFXRateDao.getConvertRateOfCurrency(149, callback);
                },

                function (rate, callback) {
                    expect(rate).to.equal(1);

                    callback();
                }
            ], done);
        });
    });
});


/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var util = require('util');

var sutPath = '../../../daos/Creditcard.js';
var CreditcardDao = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        user : true
    }, callback);
}


describe('daos/Creditcard', function () {
    describe('.getCreditcardType(number)', function () {
        it('should returns `NA` if number is empty', function () {
            expect(CreditcardDao.getCreditcardType()).to.equal('NA');
            expect(CreditcardDao.getCreditcardType('')).to.equal('NA');
            expect(CreditcardDao.getCreditcardType(null)).to.equal('NA');
            expect(CreditcardDao.getCreditcardType(undefined)).to.equal('NA');
        });


        it('should returns `visa` if number begins with 4X', function () {
            expect(CreditcardDao.getCreditcardType('4012345678901')).to.equal('visa');
        });

        it('should returns `mastercard` if number begins with 5X', function () {
            expect(CreditcardDao.getCreditcardType('5211111111111111')).to.equal('mastercard');
        });

        it('should returns `maestro` if number begins with 6759', function () {
            expect(CreditcardDao.getCreditcardType('6759649826438453')).to.equal('maestro');
        });
    });

    describe('.generateLastDigits(number)', function () {
        it('should returns the first four digits and the last four digists', function () {
            expect(CreditcardDao.generateLastDigits('123')).to.equal('123');
            expect(CreditcardDao.generateLastDigits('1234')).to.equal('1234');
            expect(CreditcardDao.generateLastDigits('12345')).to.equal('2345');
            expect(CreditcardDao.generateLastDigits('123456')).to.equal('3456');
            expect(CreditcardDao.generateLastDigits('1234567')).to.equal('4567');
            expect(CreditcardDao.generateLastDigits('12345678')).to.equal('5678');
            expect(CreditcardDao.generateLastDigits('123456789')).to.equal('6789');
            expect(CreditcardDao.generateLastDigits('1234567890')).to.equal('7890');
        });
    });

    describe('.encryptToIssueNumber(number, cvv)', function () {
        it('should encrypt number and cvv using aes-256', function () {
            expect(CreditcardDao.encryptToIssueNumber('4000009999999991', '123')).to.equal('FLu0Z+7HfGwMzb/dW6lcr8rCFri7LsMwMgGMEtiCo/Q=');
        });
    });

    describe('.decryptIssueNumber(issueNumber)', function () {
        it('should decrypt issue number using aes-256', function () {
            expect(CreditcardDao.decryptIssueNumber('FLu0Z+7HfGwMzb/dW6lcr8rCFri7LsMwMgGMEtiCo/Q=')).to.equal('4000009999999991=123');
        });
    });

    describe('.isCreditcardAllowedForRegistration(number, callback)', function () {
        it('should allow if creditcard was never used.', function (done) {
            var number = '0000000000000000';

            async.waterfall([
                getContext,

                function (context, callback) {
                    var creditcardDao = new CreditcardDao(context);
                    creditcardDao.isCreditcardAllowedForRegistration(number, callback);
                },

                function (isAllowed, callback) {
                    expect(isAllowed).to.equal(true);

                    callback();
                }
            ], done);
        });
    });

    describe('.isCreditcardAllowedForRegistration(number, callback)', function () {
        it('should allow if creditcard was never used.', function (done) {
            var number = testUtil.getTestCreditcardInfoOfNormal().number;

            async.waterfall([
                getContext,

                function (context, callback) {
                    var creditcardDao = new CreditcardDao(context);
                    creditcardDao.isCreditcardAllowedForRegistration(number, callback);
                },

                function (isAllowed, callback) {
                    expect(isAllowed).to.equal(false);

                    callback();
                }
            ], done);
        });
    });

});


/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var rewire = require('rewire');
var testUtil = require('../../testUtil');
var util = require('util');
var mapper = require('../../../mapper');

var sutPath = '../../../daos/Autoship.js';
var AutoshipDao = rewire(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        user : true
    }, callback);
}


describe('daos/Autoship', function () {
    describe.only('-getNextAutoshipDate()', function () {
        it('`next-autoship-date` should not be earlier than `start-date`', function () {
            var getNextAutoshipDate = AutoshipDao.__get__('getNextAutoshipDate'),
                now,
                autoship,
                activeDate,
                startDate,
                frequencyByMonth,
                lastAutoshipDate,
                nextAutoshipDate;

            now = new Date(2015, 0, 15);
            activeDate = 22;
            frequencyByMonth = 1;
            startDate = new Date(2015, 0, 10);
            lastAutoshipDate = null;
            nextAutoshipDate = getNextAutoshipDate(now, activeDate, frequencyByMonth, startDate, lastAutoshipDate);
            expect(nextAutoshipDate).to.eql(new Date(2015, 0, 22));

            now = new Date(2015, 0, 15);
            activeDate = 22;
            frequencyByMonth = 1;
            startDate = new Date(2015, 1, 22);
            lastAutoshipDate = null;
            nextAutoshipDate = getNextAutoshipDate(now, activeDate, frequencyByMonth, startDate, lastAutoshipDate);
            expect(nextAutoshipDate).to.eql(new Date(2015, 1, 22));

            now = new Date(2015, 0, 15);
            activeDate = 22;
            frequencyByMonth = 1;
            startDate = new Date(2014, 11, 22);
            lastAutoshipDate = null;
            nextAutoshipDate = getNextAutoshipDate(now, activeDate, frequencyByMonth, startDate, lastAutoshipDate);
            expect(nextAutoshipDate).to.eql(new Date(2015, 0, 22));

            now = new Date(2015, 0, 15);
            activeDate = 22;
            frequencyByMonth = 3;
            startDate = new Date(2014, 11, 22);
            lastAutoshipDate = null;
            nextAutoshipDate = getNextAutoshipDate(now, activeDate, frequencyByMonth, startDate, lastAutoshipDate);
            expect(nextAutoshipDate).to.eql(new Date(2015, 0, 22));

            now = new Date(2015, 0, 15);
            activeDate = 22;
            frequencyByMonth = 1;
            startDate = new Date(2015, 0, 23);
            lastAutoshipDate = null;
            nextAutoshipDate = getNextAutoshipDate(now, activeDate, frequencyByMonth, startDate, lastAutoshipDate);
            expect(nextAutoshipDate).to.eql(new Date(2015, 1, 22));

            now = new Date(2015, 0, 15);
            activeDate = 22;
            frequencyByMonth = 3;
            startDate = new Date(2015, 0, 23);
            lastAutoshipDate = null;
            nextAutoshipDate = getNextAutoshipDate(now, activeDate, frequencyByMonth, startDate, lastAutoshipDate);
            expect(nextAutoshipDate).to.eql(new Date(2015, 1, 22));

            now = new Date(2015, 0, 15);
            activeDate = 22;
            frequencyByMonth = 1;
            startDate = new Date(2015, 1, 23);
            lastAutoshipDate = null;
            nextAutoshipDate = getNextAutoshipDate(now, activeDate, frequencyByMonth, startDate, lastAutoshipDate);
            expect(nextAutoshipDate).to.eql(new Date(2015, 2, 22));

            now = new Date(2015, 0, 15);
            activeDate = 22;
            frequencyByMonth = 1;
            startDate = new Date(2014, 0, 1);
            lastAutoshipDate = new Date(2014, 11, 22);
            nextAutoshipDate = getNextAutoshipDate(now, activeDate, frequencyByMonth, startDate, lastAutoshipDate);
            expect(nextAutoshipDate).to.eql(new Date(2015, 0, 22));

            now = new Date(2015, 0, 15);
            activeDate = 22;
            frequencyByMonth = 1;
            startDate = new Date(2015, 1, 1);
            lastAutoshipDate = new Date(2014, 11, 22);
            nextAutoshipDate = getNextAutoshipDate(now, activeDate, frequencyByMonth, startDate, lastAutoshipDate);
            expect(nextAutoshipDate).to.eql(new Date(2015, 1, 22));

            now = new Date(2015, 0, 15);
            activeDate = 22;
            frequencyByMonth = 3;
            startDate = new Date(2014, 0, 1);
            lastAutoshipDate = new Date(2014, 11, 22);
            nextAutoshipDate = getNextAutoshipDate(now, activeDate, frequencyByMonth, startDate, lastAutoshipDate);
            expect(nextAutoshipDate).to.eql(new Date(2015, 2, 22));

            now = new Date(2015, 0, 15);
            activeDate = 22;
            frequencyByMonth = 3;
            startDate = new Date(2015, 1, 1);
            lastAutoshipDate = new Date(2014, 11, 22);
            nextAutoshipDate = getNextAutoshipDate(now, activeDate, frequencyByMonth, startDate, lastAutoshipDate);
            expect(nextAutoshipDate).to.eql(new Date(2015, 1, 22));

            now = new Date(2015, 4, 15);
            activeDate = 15;
            frequencyByMonth = 1;
            startDate = new Date(2015, 4, 1);
            lastAutoshipDate = null;
            nextAutoshipDate = getNextAutoshipDate(now, activeDate, frequencyByMonth, startDate, lastAutoshipDate);
            expect(nextAutoshipDate).to.eql(new Date(2015, 4, 15));
        })
    });

    describe('createAutoship()', function () {
        it('should work', function (done) {
            var context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    context.readModels.User.find(context.user.userId).done(callback);
                },

                function (user, callback) {
                    var autoshipDao = new AutoshipDao(context),
                        items = [
                            {variantId : 24, quantity : 1, catalogCode : 'AT', roleCode : 'D'},
                            {variantId : 34, quantity : 2, catalogCode : 'AT', roleCode : 'D'}
                        ],
                        address = {
                            firstname : 'Mike',
                            lastname : 'Jim',
                            address1 : '111 Autumn Drive',
                            city : 'LANCASTER',
                            country_id : 1214,
                            state_id : 10049,
                            zipcode : '43130'
                        },
                        now = new Date(),
                        startDate = new Date(now.getFullYear(), now.getMonth() + 1, 21),
                        autoship = {
                            userId : context.user.userId,
                            autoshipItems : items,
                            activeDate : 24,
                            startDate : startDate,
                            billingAddress : address,
                            shippingAddress : address,
                            shippingMethodId : 4,
                            paymentMethodId : 3004,
                            creditcard : testUtil.getTestCreditcardInfoOfNormal()
                        };

                    autoshipDao.createAutoship(autoship, callback);
                },

                function (newAutoship, callback) {
                    expect(newAutoship).to.be.ok;
                    expect(newAutoship.id).to.be.ok;
                    console.log(mapper.autoship(newAutoship));

                    callback();
                }
            ], done);
        });
    });

    describe('getAutoshipDetails()', function () {
        it('should work', function (done) {
            var context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var autoshipDao = new AutoshipDao(context),
                        getAutoshipDetailsOptions = {
                            autoshipId : 3
                        };

                    autoshipDao.getAutoshipDetails(getAutoshipDetailsOptions, callback);
                },

                function (autoship, callback) {
                    expect(autoship).to.be.ok;
                    expect(autoship.id).to.be.ok;
                    console.log(mapper.autoship(autoship));

                    callback();
                }
            ], done);
        });
    });

    describe('cancelAutoship()', function () {
        it('should not callback error when trying to cancel an unexist autoship', function (done) {
            var context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var autoshipDao = new AutoshipDao(context),
                        cancelAutoshipOptions = {
                            autoshipId : -1
                        };
                    autoshipDao.cancelAutoship(cancelAutoshipOptions, function (error) {
                        expect(error.errorCode).to.equal('InvalidAutoshipId');
                        callback();
                    });
                },
            ], done);
        });
    });
});


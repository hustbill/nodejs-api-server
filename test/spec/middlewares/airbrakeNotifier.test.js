/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');

var sutPath = '../../../middleware/airbrakeNotifier.js';
var AirbrakeNotifier = require(sutPath);


function FakeAirbrake() {
    this.errorNotified = null;

    this.notify = function (error, callback) {
        this.errorNotified = error;
        callback(null, null);
    };
}


function getRequest(callback) {
    testUtil.getContext({
        extend : {
            config : {
                airbrake : {
                    disabled : false
                }
            }
        }
    }, function (error, context) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, {context : context});
    });
}


describe('middleware/airbrakeNotifier', function () {
    describe('GET', function () {
        it('should notify error if error.statusCode is not set.', function (done) {
            async.waterfall([
                getRequest,

                function (request, callback) {
                    var airbrake = new FakeAirbrake(),
                        notify = AirbrakeNotifier.notifyTo(airbrake),
                        errMsg = 'Error occured',
                        err = new Error(errMsg);

                    notify(err, request, null, function (error) {
                        expect(error).to.be.instanceof(Error);
                        expect(error.message).to.equal(errMsg);

                        var errorNotified = airbrake.errorNotified;
                        expect(errorNotified).to.be.instanceof(Error);
                        expect(errorNotified.message).to.equal(errMsg);

                        done();
                    });
                }
            ], done);
        });


        it('should notify error if error.statusCode is 500.', function (done) {
            async.waterfall([
                getRequest,

                function (request, callback) {
                    var airbrake = new FakeAirbrake(),
                        notify = AirbrakeNotifier.notifyTo(airbrake),
                        errMsg = 'Error occured',
                        err = new Error(errMsg);

                    err.statusCode = 500;

                    notify(err, request, null, function (error) {
                        expect(error).to.be.instanceof(Error);
                        expect(error.message).to.equal(errMsg);

                        var errorNotified = airbrake.errorNotified;
                        expect(errorNotified).to.be.instanceof(Error);
                        expect(errorNotified.message).to.equal(errMsg);

                        done();
                    });
                }
            ], done);
        });


        it('should not notify error if error.statusCode is set and not equal to 500.', function (done) {
            async.waterfall([
                getRequest,

                function (request, callback) {
                    var airbrake = new FakeAirbrake(),
                        notify = AirbrakeNotifier.notifyTo(airbrake),
                        errMsg = 'Error occured',
                        err = new Error(errMsg);

                    err.statusCode = 400;

                    notify(err, request, null, function (error) {
                        expect(error).to.be.instanceof(Error);
                        expect(error.message).to.equal(errMsg);

                        var errorNotified = airbrake.errorNotified;
                        expect(errorNotified).to.be.not.ok;

                        done();
                    });
                }
            ], done);
        });


        it('should not notify error if error.ignoreAirbrake is set as true.', function (done) {
            async.waterfall([
                getRequest,

                function (request, callback) {
                    var airbrake = new FakeAirbrake(),
                        notify = AirbrakeNotifier.notifyTo(airbrake),
                        errMsg = 'Error occured',
                        err = new Error(errMsg);

                    err.statusCode = 500;
                    err.ignoreAirbrake = true;

                    notify(err, request, null, function (error) {
                        expect(error).to.be.instanceof(Error);
                        expect(error.message).to.equal(errMsg);

                        var errorNotified = airbrake.errorNotified;
                        expect(errorNotified).to.be.not.ok;

                        done();
                    });
                }
            ], done);
        });


        it('should notify error if error.forceAirbrake is set as true.', function (done) {
            async.waterfall([
                getRequest,

                function (request, callback) {
                    var airbrake = new FakeAirbrake(),
                        notify = AirbrakeNotifier.notifyTo(airbrake),
                        errMsg = 'Error occured',
                        err = new Error(errMsg);

                    err.statusCode = 400;
                    err.forceAirbrake = true;

                    notify(err, request, null, function (error) {
                        expect(error).to.be.instanceof(Error);
                        expect(error.message).to.equal(errMsg);

                        var errorNotified = airbrake.errorNotified;
                        expect(errorNotified).to.be.instanceof(Error);
                        expect(errorNotified.message).to.equal(errMsg);

                        done();
                    });
                }
            ], done);
        });



        it('should not notify error if airbrake is disabled.', function (done) {
            async.waterfall([
                getRequest,

                function (request, callback) {
                    var airbrake = new FakeAirbrake(),
                        notify = AirbrakeNotifier.notifyTo(airbrake),
                        errMsg = 'Error occured',
                        err = new Error(errMsg);

                    request.context.config.airbrake.disabled = true;

                    notify(err, request, null, function (error) {
                        expect(error).to.be.instanceof(Error);
                        expect(error.message).to.equal(errMsg);

                        var errorNotified = airbrake.errorNotified;
                        expect(errorNotified).to.be.not.ok;

                        done();
                    });
                }
            ], done);
        });
    });
});

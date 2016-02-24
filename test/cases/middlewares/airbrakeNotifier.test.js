var YUITest = require('yuitest').YUITest;
var mockery = require('mockery');
var Sequelize = require('sequelize');

var Assert = YUITest.Assert;
var sutPath = '../../../middleware/airbrakeNotifier.js';
var AirbrakeNotifier = require(sutPath);

function FakeAirbrake() {
    this.errorNotified = null;

    this.notify = function (error, callback) {
        this.errorNotified = error;
        callback(null, null);
    };
}

YUITest.TestRunner.add(new YUITest.TestCase({
    name : 'middlewares/airbrakeNotifier',

    setUp : function () {
        var consoleLogTarget = function () {
            console.log.apply(console, arguments);
        };

        this.context = {
            logger : {
                trace : consoleLogTarget,
                info : consoleLogTarget,
                warn : consoleLogTarget,
                error : consoleLogTarget
            },
            config : {
                airbrake : {
                    disabled : false
                }
            }
        };

        mockery.enable();
        mockery.registerAllowable('util');
        mockery.registerAllowable('sequelize');
        mockery.registerAllowable(sutPath, true);
    },

    tearDown : function () {
        mockery.deregisterAll();
        mockery.disable();
    },

    testNotify : function () {
        var self = this,
            airbrake = new FakeAirbrake(),
            notify = AirbrakeNotifier.notifyTo(airbrake),
            request = {context : this.context},
            errMsg = 'Error occured',
            err = new Error(errMsg);

        notify(err, request, null, function (err) {
            Assert.isNotNull(airbrake.errorNotified);
            Assert.areSame(errMsg, airbrake.errorNotified.message);
        });
    },

    testNotifyIfStatusCodeIsSetTo500 : function () {
        var self = this,
            airbrake = new FakeAirbrake(),
            notify = AirbrakeNotifier.notifyTo(airbrake),
            request = {context : this.context},
            errMsg = 'Error occured',
            err = new Error(errMsg);

        err.statusCode = 500;
        notify(err, request, null, function (err) {
            Assert.isNotNull(airbrake.errorNotified);
            Assert.areSame(errMsg, airbrake.errorNotified.message);
        });
    },

    testNotNotifyIfStatusCodeIsNotSetTo500 : function () {
        var self = this,
            airbrake = new FakeAirbrake(),
            notify = AirbrakeNotifier.notifyTo(airbrake),
            request = {context : this.context},
            errMsg = 'Error occured',
            err = new Error(errMsg);

        err.statusCode = 400;
        notify(err, request, null, function (err) {
            Assert.isNull(airbrake.errorNotified);
        });
    },

    testNotNotifyIfIgnoreAirbrakeIsTrue : function () {
        var self = this,
            airbrake = new FakeAirbrake(),
            notify = AirbrakeNotifier.notifyTo(airbrake),
            request = {context : this.context},
            errMsg = 'Error occured',
            err = new Error(errMsg);

        err.ignoreAirbrake = true;
        notify(err, request, null, function (err) {
            Assert.isNull(airbrake.errorNotified);
        });
    },

    testNotifyIfForceAirbrakeIsTrue : function () {
        var self = this,
            airbrake = new FakeAirbrake(),
            notify = AirbrakeNotifier.notifyTo(airbrake),
            request = {context : this.context},
            errMsg = 'Error occured',
            err = new Error(errMsg);

        err.forceAirbrake = true;
        err.statusCode = 400;
        notify(err, request, null, function (err) {
            Assert.isNotNull(airbrake.errorNotified);
            Assert.areSame(errMsg, airbrake.errorNotified.message);
        });
    },

    testNotNotifyIfAirbrakeIsDisabled : function () {
        var self = this,
            airbrake = new FakeAirbrake(),
            notify = AirbrakeNotifier.notifyTo(airbrake),
            request = {
                context : {
                    config : {
                        airbrake : {
                            disabled : true
                        }
                    }
                }
            },
            errMsg = 'Error occured',
            err = new Error(errMsg);

        notify(err, request, null, function (err) {
            Assert.isNull(airbrake.errorNotified);
        });
    }
}));



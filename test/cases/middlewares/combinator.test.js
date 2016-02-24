var YUITest = require('yuitest').YUITest;
var mockery = require('mockery');
var Sequelize = require('sequelize');

var Assert = YUITest.Assert;
var sutPath = '../../../middleware/combinator.js';
var Combinator = require(sutPath);

function FakeAirbrake() {
    this.errorNotified = null;

    this.notify = function (error, callback) {
        this.errorNotified = error;
        callback(null, null);
    };
}

YUITest.TestRunner.add(new YUITest.TestCase({
    name : 'middlewares/combinator',

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

    testOrNoError : function () {
        var self = this,
            combinatedMiddleware = Combinator.or(
                function (req, res, next) {
                    next();
                },

                function (req, res, next) {
                    next();
                }
            );

        combinatedMiddleware(null, null, function (err) {
            Assert.areSame(false, !!err);
        });
    },

    testOrFirstError : function () {
        var self = this,
            combinatedMiddleware = Combinator.or(
                function (req, res, next) {
                    next(new Error('first error'));
                },

                function (req, res, next) {
                    next();
                }
            );

        combinatedMiddleware(null, null, function (err) {
            Assert.areSame(false, !!err);
        });
    },

    testOrLastError : function () {
        var self = this,
            combinatedMiddleware = Combinator.or(
                function (req, res, next) {
                    next();
                },

                function (req, res, next) {
                    next(new Error('last error'));
                }
            );

        combinatedMiddleware(null, null, function (err) {
            Assert.areSame(false, !!err);
        });
    },

    testOrAllError : function () {
        var self = this,
            combinatedMiddleware = Combinator.or(
                function (req, res, next) {
                    next(new Error('first error'));
                },

                function (req, res, next) {
                    next(new Error('last error'));
                }
            );

        combinatedMiddleware(null, null, function (err) {
            Assert.isNotNull(err);
            Assert.areSame(err.message, 'last error');
        });
    }
}));



var YUITest = require('yuitest').YUITest;
var mockery = require('mockery');
var Sequelize = require('sequelize');

var Assert = YUITest.Assert;
var sutPath = '../../../lib/utils.js';
var utils = require(sutPath);

YUITest.TestRunner.add(new YUITest.TestCase({
    name : 'lib/utils/validateModel',

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
            sequelize : new Sequelize()
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

    testValidateModelSuccess : function () {
        var self = this,
            sequelize = this.context.sequelize,
            factory,
            model;

        factory = sequelize.define('model1', {
            foo : {
                type : Sequelize.STRING,
                validate : {
                    equals : 'bar'
                }
            }
        });

        model = factory.build({foo : 'bar'});
        utils.validateModel(model, function (error, failures) {

            Assert.isNull(error);
            Assert.isNull(failures);
        });
    },

    testValidateModelWithCustomSyncValidatorSuccess : function () {
        var self = this,
            sequelize = this.context.sequelize,
            factory,
            model;

        factory = sequelize.define('model1', {
            foo : {
                type : Sequelize.STRING,
                validate : {
                    customValidate : function (value) {
                    }
                }
            }
        });

        model = factory.build({foo : 'bar'});
        utils.validateModel(model, function (error, failures) {

            Assert.isNull(error);
            Assert.isNull(failures);
        });
    },

    testValidateModelWithCustomSyncValidatorError : function () {
        var self = this,
            errorMessage = 'validate error with field \'foo\'',
            sequelize = this.context.sequelize,
            factory,
            model;

        factory = sequelize.define('model1', {
            foo : {
                type : Sequelize.STRING,
                validate : {
                    customValidate : function (value) {
                        throw new Error(errorMessage);
                    }
                }
            }
        });

        model = factory.build({foo : 'bar'});
        utils.validateModel(model, function (error, failures) {

            Assert.isNull(error);
            Assert.isNotNull(failures);
            Assert.areEqual(errorMessage, failures.foo[0]);
        });
    },

    testValidateModelWithCustomAsyncValidatorSuccess : function () {
        var self = this,
            sequelize = this.context.sequelize,
            factory,
            model;

        factory = sequelize.define('model1', {
            foo : {
                type : Sequelize.STRING,
                validate : {
                    customValidate : function (value, callback) {
                        callback();
                    }
                }
            }
        });

        model = factory.build({foo : 'bar'});
        utils.validateModel(model, function (error, failures) {

            Assert.isNull(error);
            Assert.isNull(failures);
        });
    },

    testValidateModelWithCustomAsyncValidatorError : function () {
        var self = this,
            errorMessage = 'validate error with field \'foo\'',
            sequelize = this.context.sequelize,
            factory,
            model;

        factory = sequelize.define('model1', {
            foo : {
                type : Sequelize.STRING,
                validate : {
                    customValidate : function (value, callback) {
                        callback(new Error(errorMessage));
                    }
                }
            }
        });

        model = factory.build({foo : 'bar'});
        utils.validateModel(model, function (error, failures) {
            Assert.isNull(error);
            Assert.isNotNull(failures);
            Assert.areEqual(errorMessage, failures.foo[0]);
        });
    }

}));



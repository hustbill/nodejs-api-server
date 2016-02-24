/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var Sequelize = require('sequelize');

var sutPath = '../../../lib/utils.js';
var utils = require(sutPath);


function getContext(callback) {
    testUtil.getContext(null, callback);
}


describe('lib/utils', function () {
    describe('validateModel', function () {
        it('should not callback error if validate passed with pre-defined validator.', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var sequelize = new Sequelize(),
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
                        expect(error).to.be.null;
                        expect(failures).to.be.null;

                        done();
                    });
                }
            ], done);
        });


        it('should not callback error if validate passed with custom sync validator.', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var sequelize = new Sequelize(),
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
                        expect(error).to.be.null;
                        expect(failures).to.be.null;

                        done();
                    });
                }
            ], done);
        });


        it('should callback failures if validate failed with custom sync validator.', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var sequelize = new Sequelize(),
                        errorMessage = 'validate error with field \'foo\'',
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
                        expect(error).to.be.null;
                        expect(failures).to.be.ok;
                        expect(failures.foo[0]).to.equal(errorMessage);

                        done();
                    });
                }
            ], done);
        });


        it('should not callback error if validate passed with custom async validator.', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var sequelize = new Sequelize(),
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
                        expect(error).to.be.null;
                        expect(failures).to.be.null;

                        done();
                    });
                }
            ], done);
        });


        it('should callback failures if validate failed with custom sync validator.', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var sequelize = new Sequelize(),
                        errorMessage = 'validate error with field \'foo\'',
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
                        expect(error).to.be.null;
                        expect(failures).to.be.ok;
                        expect(failures.foo[0]).to.equal(errorMessage);

                        done();
                    });
                }
            ], done);
        });
    });
});

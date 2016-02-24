/*global describe, it */
/*jshint expr:true */

var rewire = require('rewire');
var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');

var suitPath = '../../../lib/orderPlugins/index.js';
var orderPlugins = rewire(suitPath);


describe('lib/orderPlugins', function () {
    describe('loadPlugins()', function () {
        it('return all plugins in orderPlugins directory', function (done) {
            var plugins = orderPlugins.__get__('loadPlugins')();

            expect(plugins).to.be.instanceof(Array);
            done();
        });
    });
});

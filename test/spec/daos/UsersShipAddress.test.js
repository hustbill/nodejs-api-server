/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var u = require('underscore');
var testUtil = require('../../testUtil');
var util = require('util');
var UserDao = require('../../../daos/User');
var AddressDao = require('../../../daos/Address');

var sutPath = '../../../daos/UsersShipAddress.js';
var UsersShipAddressDao = require(sutPath);

function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        user : true
    }, callback);
}


describe('daos/UsersShipAddress', function () {
    describe('saveUserShipAddress()', function () {
        it('should work', function (done) {
            var testContext,
                testUser;
            async.waterfall([
                getContext,

                function(context, callback){
                    testContext = context;
                    userDao = new UserDao(context);
                    userDao.getById(context.user.userId, callback);
                },

                function(user, callback){
                    testUser = user;
                    userDao.getAddressesOfUser(user, callback);
                },

                function(addressInfo, callback){
                    var usersShipAddressDao = new UsersShipAddressDao(testContext);
                    usersShipAddressDao.saveUserShipAddress(testUser, addressInfo.home, true, false, callback);
                }
            ], done);
        });
    });

    describe("getSameShipAddress", function(){
        it("should work", function (done) {
            var testContext,
                testUser;
            async.waterfall([
                getContext,

                function(context, callback){
                    testContext = context;
                    userDao = new UserDao(context);
                    userDao.getById(context.user.userId, callback);
                },

                function(user, callback){
                    testUser = user;
                    userDao.getAddressesOfUser(user, callback);
                },

                function(addressInfo, callback){
                    var usersShipAddressDao = new UsersShipAddressDao(testContext);
                    usersShipAddressDao.getSameShipAddress(testUser.id, addressInfo.home, function(error, results){
                        callback(error);
                    });
                }
            ], done);
        }); 
    });

    describe("createUserShippingAddress", function(){
        it("should work", function (done) {
            var testContext,
                testUser,
                userDao,
                addressDao;
            async.waterfall([
                getContext,

                function(context, callback){
                    testContext = context;
                    userDao = new UserDao(context);
                    userDao.getById(context.user.userId, callback);
                },

                function(user, callback){
                    testUser = user;
                    userDao.getAddressesOfUser(user, callback);
                },

                function(addressInfo, callback){
                    addressDao = new AddressDao(testContext);
                    addressDao.createUserShippingAddress(testUser, addressInfo.home, callback);
                }
            ], done);
        }); 
    });
});

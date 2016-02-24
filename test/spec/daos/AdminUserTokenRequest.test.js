/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var u = require('underscore');
var testUtil = require('../../testUtil');
var util = require('util');

var sutPath = '../../../daos/AdminUserTokenRequest.js';
var AdminUserTokenRequest = require(sutPath);

function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        user : true
    }, callback);
}


describe('daos/AdminUserTokenRequest', function () {

    describe('add', function () {
        it('should work.', function (done) {
            var adminUserTokenRequestDao;

            async.waterfall([
                function (callback) {
                    getContext(callback);
                },
                function (context, callback) {
                    adminUserTokenRequestDao = new AdminUserTokenRequest(context);
                    adminUserTokenRequestDao.add({
                        hide_from_display: true,
                        admin_user_id: 1,
                        user_id: 2,
                        source_ip: '127.0.0.1',
                        tt: new Date(2015, 5, 16, 13, 26, 0)
                    }, callback);
                }
            ], function (error, result) {
                if(error) {
                    done(error);
                }
                expect(result).to.have.property('id');
                expect(result).to.have.property('admin_user_id', 1);
                expect(result).to.have.property('hide_from_display', true);
                expect(result).to.have.property('user_id', 2);
                expect(result).to.have.property('source_ip', '127.0.0.1');
                done(null);
            });
        });

        it('should work.', function (done) {

            async.waterfall([
                function (callback) {
                    getContext(callback);
                },
                function (context, callback) {
                    adminUserTokenRequestDao = new AdminUserTokenRequest(context);
                    var sql = '';
                    sql += 'insert into admin_user_token_requests(hide_from_display, admin_user_id, user_id, source_ip, created_at) values($1, $2, $3, $4, $5)';

                    options = {
                        useWriteDatabase: true,
                        sqlStmt: sql,
                        sqlParams: [true, 1, 2, '127.0.0.2', new Date(2014, 17, 2)]
                    };

                    adminUserTokenRequestDao.queryDatabase(options, callback);
                }
            ], function (error, result) {
                done(error);
            });

        });

    });

});
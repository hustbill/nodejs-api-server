/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/admin/user/token/post.js';
var handler = require(sutPath);

function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        redis : true,
        user : true
    }, callback);
}


describe('/handler/v2/admin/user/token/post.js', function () {

    describe('retrieveToken', function () {
        before(function () {
            mockery.enable();
            mockery.warnOnReplace(false);
            mockery.warnOnUnregistered(false);
        });

        after(function () {
            mockery.deregisterAll();
            mockery.disable();
        });

        it('should work.', function (done) {
            var request;
            var response = {};

            async.waterfall([
                getContext,

                function (context, callback) {
                    request = {
                        context: context,
                        body: {
                            'ios-push-notification-token': '',
                            'pushNotificationToken': ''
                        },
                        headers: {
                            'x-client-id': '3131311',
                            'x-device-ip': '127.0.0.1',
                            'x-forwarded-for': '127.0.0.1',
                            'x-device-info': 'test'
                        },
                        params: {
                            userId: 352
                        }
                    };
                    callback();
                },
                function (callback) {
                    handler(request, response, callback);
                }
            ], function (result) {
                if (result instanceof Error){
                    done(result);
                }
                expect(result).to.have.property('statusCode', 200);
                expect(result).to.have.property('body');
                done(null);
            });
        });
    });
});
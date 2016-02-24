var should = require('should');
var muk = require('muk');
var mocks = require('node-mocks-http');
var daos = require('../../../daos');
var handles = require('../../../handlers');
var _ = require('underscore');

var logger = {};
logger.trace = console.log;
logger.debug = console.log;
logger.info = console.log;
logger.error = console.log;

var readDatabaseClient = {};
var user = {userId: 123456};

var context = {};
context.logger = logger;
context.readDatabaseClient = readDatabaseClient;
context.user = user;


var req = mocks.createRequest();
req.context = context;
req.params.visitorId = 123456;


var res = mocks.createResponse();

var settings = {'facebook-link': 'http://facebook.com/aaa',
'twitter-link': 'http://twitter.com/aaa',
'instagram-link': 'http://instagram.com/aaa',
'google-plus-link': 'http://plus.google.com/aaa',
'social-media': ' media text',
'contact-page-description': 'description text'
};



describe('Social Settings Test Case', function () {

    before(function () {

        muk(readDatabaseClient, 'query', function (stmp, params, callback) {
            callback(null, {rows:[{user_id:user.userId, settings:JSON.stringify(settings)}]});
        });
    });

    after(function () {
        muk.restore();
    });

    //  describe('validation', function () {
    //     it('normal test', function (done) {
    //         req.query['role-code'] = 'R';
    //         shoppingCart.visitor.get(req, res, function (result) {
    //             logger.debug("result:%j", result);
    //             result.should.have.status(200);
    //             result.should.have.property('body').have.property('line-items').with.lengthOf(1);
    //             done();
    //         });
    //     });




    // });

    describe('post action', function () {
        it('normal test', function (done) {
            req.body = {
                'facebook-link': 'http://facebook.com/aaa',
                'twitter-link': 'http://twitter.com/aaa',
                'instagram-link': 'http://instagram.com/aaa',
                'google-plus-link': 'http://plus.google.com/aaa',
                'social-media': ' media text',
                'contact-page-description': 'description text'
            };
            handles.v2.socialSetting.post(req, res, function (result) {
                result.should.have.status(200);
                console.log("post settings:%j", result.body);
                done();
            });
        });


    });

    describe('put action', function () {
        it('normal test', function (done) {
            req.body = {
                'facebook-link': 'http://facebook.com/bb',
                'twitter-link': 'http://twitter.com/bb',
                'instagram-link': 'http://instagram.com/bb',
                'google-plus-link': 'http://plus.google.com/bb',
                'social-media': '',
                'contact-page-description': ''
            };
            handles.v2.socialSetting.put(req, res, function (result) {
                result.should.have.status(200);
                console.log("put settings:%j", result.body);
                done();
            });
        });


    });
    describe('get action', function () {
        it('normal test', function (done) {
            handles.v2.socialSetting.get(req, res, function (result) {
                result.should.have.status(200);
                console.log("get settings:%j", result.body);
                done();
            });
        });


    });

   


});




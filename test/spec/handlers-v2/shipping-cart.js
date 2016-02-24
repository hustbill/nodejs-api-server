var should = require('should');
var muk = require('muk');
var mocks = require('node-mocks-http');
var daos = require('../../../daos');
var handles = require('../../../handlers');
var shoppingCart = handles.v2.shoppingCart;
var _ = require('underscore');

var logger = {};
logger.trace = console.log;
logger.debug = console.log;
logger.info = console.log;
logger.error = console.log;

var redisClient = {};
var user = {userId: 123456};

var context = {};
context.logger = logger;
context.redisClient = redisClient;
context.user = user;


var req = mocks.createRequest();
req.context = context;
req.params.visitorId = 123456;


var res = mocks.createResponse();

var cacheObj = {
    id: '12345',
    'line-items': [
        {
            'variant-id': 1234,
            quantity: 2,
            'catalog-code': 'a001',
            'role-code': 'R',
            "personalized-values": [
                {
                    "personalized-type-id": 3,
                    "personalized-value": "firstanme"
                },
                {
                    "personalized-type-id": 4,
                    "personalized-value": "firstanme3"
                }
            ]
        },
        {
            'variant-id': 1235,
            quantity: 2,
            'catalog-code': 'a001',
            'role-code': 'R'
        }
    ]
};



describe('shoppingCart', function () {

    before(function () {
        muk(redisClient, 'get', function (key, callback) {
            callback(null, JSON.stringify(cacheObj));
        });
        muk(redisClient, 'set', function (key, val, callback) {
            callback(null, val);
        });

        muk(daos, 'createDao', function (type, ctx) {
            return {
                getVariantDetailForUser: function (options, callback) {
                    if (options.variantId == 1234) {
                        callback(null, {});
                    } else {
                        callback(new Error('NotFound'));
                    }
                },
                getVariantDetailForRole: function (options, callback) {
                    if (options.variantId == 1234) {
                        callback(null, {});
                    } else {
                        callback(new Error('NotFound'));
                    }
                }
            };
        });
    });

    after(function () {
        muk.restore();
    });

    describe('user', function () {
        it('get', function (done) {
            shoppingCart.user.get(req, res, function (result) {
                result.should.have.status(200);
                result.should.have.property('body').have.property('line-items').with.lengthOf(1);
                done();
            });
        });


        it('post', function (done) {
            req.body = cacheObj;
            shoppingCart.user.post(req, res, function (result) {
                result.should.have.status(200);
                result.should.have.property('body').have.property('line-items').with.lengthOf(1);
                done();
            });
        });


        describe('lineitem', function () {
            it('put', function (done) {
                req.body = cacheObj['line-items'];
                shoppingCart.user.lineItem.put(req, res, function (result) {
                    result.should.have.status(200);
                    result.should.have.property('body').with.lengthOf(1);
                    done();
                });
            });

            it('post', function (done) {
                req.body = cacheObj['line-items'];
                shoppingCart.user.lineItem.post(req, res, function (result) {
                    logger.debug("result:%j", result);
                    result.should.have.status(200);
                    result.should.have.property('body').with.lengthOf(1);
                    result.should.have.property('body').have.property('0').and.have.property('quantity', 4);
                    done();
                });
            });

        });


    });

    describe('visitor', function () {
        it('get', function (done) {
            req.query['role-code'] = 'R';
            shoppingCart.visitor.get(req, res, function (result) {
                logger.debug("result:%j", result);
                result.should.have.status(200);
                result.should.have.property('body').have.property('line-items').with.lengthOf(1);
                done();
            });
        });


        it('post', function (done) {
            req.body = cacheObj;
            req.body['role-code'] = 'R';
            shoppingCart.visitor.post(req, res, function (result) {
                result.should.have.status(200);
                result.should.have.property('body').have.property('line-items').with.lengthOf(1);
                done();
            });
        });


        describe('lineitem', function () {
            it('put', function (done) {
                req.body = cacheObj['line-items'];
                shoppingCart.visitor.lineItem.put(req, res, function (result) {
                    result.should.have.status(200);
                    result.should.have.property('body').with.lengthOf(1);
                    done();
                });
            });

            it('post', function (done) {
                req.body = [
                    {
                        'variant-id': 1234,
                        quantity: 2,
                        'catalog-code': 'a001',
                        'role-code': 'R',
                        "personalized-values": [
                            {
                                "personalized-type-id": 3,
                                "personalized-value": "pet"
                            },
                            {
                                "personalized-type-id": 4,
                                "personalized-value": "firstanme3"
                            }
                        ]
                    }
                ];
                shoppingCart.visitor.lineItem.post(req, res, function (result) {
                    logger.debug("result:%j", result);
                    result.should.have.status(200);
                    result.should.have.property('body').with.lengthOf(2);
                    result.should.have.property('body').have.property('0').and.have.property('quantity', 2);
                    done();
                });
            });

        });


    });


});




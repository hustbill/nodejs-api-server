/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/giftCard/post.js';
var handler = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        redis : true,
        user : true
    }, callback);
}

describe('handlers/v2/order', function () {
    describe('GET', function () {
        before(function () {
            mockery.enable();
            mockery.warnOnReplace(false);
            mockery.warnOnUnregistered(false);
        });

        after(function () {
            mockery.deregisterAll();
            mockery.disable();
        });

        it('should work', function (done) {
            async.waterfall([
                getContext,

                function (context, callback) {
                    var mailingInfo = {
                            'message' : 'mailing-message',
                            'first-name' : 'Mike',
                            'last-name' : 'Jim',
                            street : '111 Autumn Drive',
                            city : 'LANCASTER',
                            'country-id' : 1214,
                            'state-id' : 10049,
                            zip : '43130'
                        },
                        request = {
                            context : context,
                            body : {
                                'giftcards' : [
                                    {
                                        'variant-id' : 110,
                                        'quantity' : 2,
                                        'email-info' : {
                                            'message' : 'email-message',
                                            'name-from' : 'name-from',
                                            'name-to' : 'name-to',
                                            'recipient-email' : 'recipient-email@test.com'
                                        }
                                    },
                                    {
                                        'variant-id' : 118,
                                        'quantity' : 1,
                                        'email-info' : {
                                            'message' : 'email-message',
                                            'name-from' : 'name-from',
                                            'name-to' : 'name-to',
                                            'recipient-email' : 'recipient-email@test.com'
                                        }
                                    }
                                ],
                                'creditcard' :  {
                                    'number' : '4000009999999991',
                                    'expiration-year' : '2123',
                                    'expiration-month' : '12',
                                    'cvv' : '123'
                                }
                            }
                        },
                        response = {
                            set : function (key, value) {
                                if (!this.headers) {
                                    this.headers = {};
                                }

                                this.headers[key] = value;
                            }
                        };

                    handler(request, response, function (result) {
                        expect(result).to.be.an('object');
                        console.log(result);

                        callback();
                    });
                }
            ], done);
        });

    });
});

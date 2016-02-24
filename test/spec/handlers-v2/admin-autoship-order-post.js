/*global describe, it, before, after */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var mockery = require('mockery');
var testUtil = require('../../testUtil');

var sutPath = '../../../handlers/v2/admin/autoship/order/post.js';
var handler = require(sutPath);

var AutoshipDao = require('../../../daos/Autoship');

function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        redis : true,
        user : true
    }, callback);
}

describe('handlers/v2/admin/autoships/order', function () {
    describe('POST', function () {
        before(function () {
            mockery.enable();
            mockery.warnOnReplace(false);
            mockery.warnOnUnregistered(false);
        });

        after(function () {
            mockery.deregisterAll();
            mockery.disable();
        });

        it('should create an autoship order.', function (done) {
            var context;

            async.waterfall([
                getContext,

                function (result, callback) {
                    context = result;

                    var autoshipDao = new AutoshipDao(context),
                        items = [
                            {variantId : 24, quantity : 1, catalogCode : 'AT', roleCode : 'D'},
                            {variantId : 34, quantity : 2, catalogCode : 'AT', roleCode : 'D'}
                        ],
                        address = {
                            firstname : 'Mike',
                            lastname : 'Jim',
                            address1 : '111 Autumn Drive',
                            city : 'LANCASTER',
                            country_id : 1214,
                            state_id : 10049,
                            zipcode : '43130'
                        },
                        autoship = {
                            userId : context.user.userId,
                            autoshipItems : items,
                            billingAddress : address,
                            shippingAddress : address,
                            shippingMethodId : 4,
                            paymentMethodId : 3004,
                            creditcard : testUtil.getTestCreditcardInfoOfNormal()
                        };

                    autoshipDao.createAutoship(autoship, callback);
                },

                function (autoship, callback) {
                    expect(autoship.state).to.equal('complete');

                    var request = {
                            context : context,
                            params : {
                                autoshipId : autoship.id
                            }
                        },
                        response;

                    handler(request, response, function (result) {
                        console.log(result);

                        expect(result.statusCode).to.equal(201);

                        var order = result.body;
                        expect(order.state).to.equal('complete');
                        callback();
                    });
                }
            ], done);
        });
    });
});

/**
 * GiftCard DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var daos = require('./index');
var utils = require('../lib/utils')

function GiftCardPayment(context) {
    DAO.call(this, context);
}

util.inherits(GiftCardPayment, DAO);


GiftCardPayment.prototype.createGiftCardPayment = function (giftCardPayment, callback) {
    this.models.GiftCardPayment.create(giftCardPayment).done(callback);
};


module.exports = GiftCardPayment;

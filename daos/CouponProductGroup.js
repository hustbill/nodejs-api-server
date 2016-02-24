/**
 * CouponProductGroup DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function CouponProductGroup(context) {
    DAO.call(this, context);
}

util.inherits(CouponProductGroup, DAO);


CouponProductGroup.prototype.getCouponProductGroupDetailsById = function (id, callback) {
    var context = this.context,
        couponProductGroup;

    async.waterfall([
        function (callback) {
            context.readModels.CouponProductGroup.find(id).done(callback);
        },

        function (result, next) {
            couponProductGroup = result;
            if (!couponProductGroup) {
                callback(null, null);
                return;
            }

            context.readModels.CouponProductGroupProduct.findAll({
                where : {coupon_product_group_id : couponProductGroup.id}
            }).done(function (error, groupProducts) {
                if (error) {
                    callback(error);
                    return;
                }

                couponProductGroup.groupProducts = groupProducts;
                next();
            });
        },

        function (callback) {
            callback(null, couponProductGroup);
        }
    ], callback);
};

module.exports = CouponProductGroup;


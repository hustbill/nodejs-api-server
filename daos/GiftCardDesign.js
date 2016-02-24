/**
 * GiftCardDesign DAO class.
 */

var util = require('util');
var async = require('async');
var underscore = require('underscore');
var DAO = require('./DAO.js');
var daos = require('./index');

function GiftCardDesign(context) {
    DAO.call(this, context);
}

util.inherits(GiftCardDesign, DAO);


function getAssetById(assets, id) {
    return underscore.find(assets, function (asset) {
        return asset.id === id;
    });
}

function getAssetImageUrl(assets, assetId, websiteUrl) {
    var asset = getAssetById(assets, assetId),
        imageUrl;

    if (!asset) {
        return null;
    }

    return websiteUrl + '/upload/image/' + asset.id + '/' + asset.attachment_file_name;
}

/**
 * Get gift card by code and pin
 * @param callback {Function} Callback function.
 */
GiftCardDesign.prototype.getGiftCardDesigns = function (callback) {
    var context = this.context,
        giftCardDesigns;

    async.waterfall([
        function (callback) {
            context.readModels.GiftCardDesign.findAll().done(callback);
        },

        function (result, next) {
            giftCardDesigns = result;

            if (!giftCardDesigns.length) {
                callback(null, []);
                return;
            }

            var assetDao = daos.createDao('Asset', context),
                assetIds = [];
            giftCardDesigns.forEach(function (giftCardDesign) {
                assetIds.push(giftCardDesign.small_image_asset_id);
                assetIds.push(giftCardDesign.large_image_asset_id);
            });

            if (!assetIds.length) {
                callback(null, giftCardDesigns);
                return;
            }

            assetDao.getAssetsInIds(assetIds, next);
        },

        function (assets, callback) {
            // fill image urls
            var websiteUrl = context.config.websiteUrl || '';

            giftCardDesigns.forEach(function (giftCardDesign) {
                giftCardDesign.smallImage = getAssetImageUrl(assets, giftCardDesign.small_image_asset_id, websiteUrl);
                giftCardDesign.largeImage = getAssetImageUrl(assets, giftCardDesign.large_image_asset_id, websiteUrl);
            });

            callback(null, giftCardDesigns);
        }
    ], callback);
};

module.exports = GiftCardDesign;

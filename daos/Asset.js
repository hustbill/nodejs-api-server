/**
 * Asset DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function Asset(context) {
    DAO.call(this, context);
}

util.inherits(Asset, DAO);

/**
 * save avatar attachment of user in the assets table.
 *
 * avatar : {
 *      userId : <id of the user>,
 *      fileName : <avatar file name>,
 *      contentType : <content type of the avatar>
 * }
 *
 * callback prototype:
 * callback(error);
 *
 * @param avatar {Object} avatar info.
 * @param callback {Function} callback function.
 */
Asset.prototype.saveUserAvatar = function (avatar, callback) {
    var self = this;

    async.waterfall([function (callback) {
        self.models.Asset.find({
            where : {
                viewable_id : avatar.userId,
                viewable_type : 'User',
                type : 'Avatar'
            }
        }).success(function (asset) {
            callback(null, asset);
        }).error(callback);

    }, function (asset, callback) {
        var now = new Date();
        if (asset) {
            asset.attachment_content_type = avatar.contentType;
            asset.attachment_file_name = avatar.fileName;
            asset.attachment_updated_at = now;

            asset.save().success(function (asset) {
                callback(null, asset);
            }).error(callback);
        } else {
            self.models.Asset.create({
                viewable_id : avatar.userId,
                viewable_type : 'User',
                attachment_content_type : avatar.contentType,
                attachment_file_name : avatar.fileName,
                attachment_size : null,
                position : 1,
                type : 'Avatar'
            }).success(function (asset) {
                callback(null, asset);
            }).error(callback);
        }
    }], callback);
};


Asset.prototype.getAvatarAssetByUserId = function (userId, callback) {
    this.readModels.Asset.find({
        where : {
            viewable_id : userId,
            viewable_type : 'User',
            type : 'Avatar'
        }
    }).done(callback);
};


Asset.prototype.getProductAssetsInIds = function (productIds, callback) {
    this.readModels.Asset.findAll({
        where : {
            viewable_type : 'Product',
            viewable_id : productIds
        },
        order : "position"
    }).done(callback);
};

Asset.prototype.getVariantAssetsInIds = function (variantIds, callback) {
    this.readModels.Asset.findAll({
        where : {
            viewable_type : 'Variant',
            viewable_id : variantIds
        },
        order : "position"
    }).done(callback);
};

Asset.prototype.getAssetsInIds = function (assetIds, callback) {
    this.readModels.Asset.findAll({
        where : {
            id : assetIds
        },
        order : "position"
    }).done(callback);
};

module.exports = Asset;

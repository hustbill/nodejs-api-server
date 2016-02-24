// POST /v2/profile/avatar

var async = require('async');
var fs = require('fs');
var im = require('imagemagick');
var uuid = require('node-uuid');
var path = require('path');
var mongodb = require('mongodb');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');

var THUMBNAIL_SPECIFICATIONS = [
    {
        size : 300,
        name : ''
    }, {
        size : 201,
        name : 'thumb'
    }, {
        size : 74,
        name : 'small'
    }];

// Constants
var DEFAULT_IMAGE_URL = '/images/nopic_mini.jpg';
var IMAGE_URL_PREFIX = '/upload/avatar/';

function getImageUrl(id, attachmentFilename, websiteUrl) {
    if (attachmentFilename) {
        return websiteUrl + IMAGE_URL_PREFIX + id + '/small_' + attachmentFilename;
    }
    return websiteUrl + DEFAULT_IMAGE_URL;
}

function validateAvatarFile(avatarFile, callback) {
    var error,
        extname;

    if (!avatarFile || avatarFile.size === 0) {
        error = new Error('Avatar is required.');
        error.statusCode = 400;
        callback(error);
        return;
    }

    extname = path.extname(avatarFile.name).toLowerCase();
    if (extname !== '.jpg' && extname !== '.jpeg' && extname !== '.png' && extname !== '.gif') {
        error = new Error('Unsupported avatar file format.');
        error.statusCode = 400;
        callback(error);
        return;
    }

    callback();
}

function generateThumbnail(avatarFile, size, callback) {
    var sourcepath = avatarFile.path,
        dirname = path.dirname(sourcepath),
        extname = path.extname(avatarFile.name),
        basename = path.basename(sourcepath, extname),
        destpath = path.join(dirname, basename + '-' + size) + extname;

    im.resize({
        srcPath : sourcepath,
        dstPath : destpath,
        width : size
    }, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, destpath);
    });
}

function deleteThumbnailFiles(context, thumbnails, callback) {
    async.forEachSeries(thumbnails, function (eachThumbnail, callback) {
        if (!eachThumbnail.filepath) {
            callback();
            return;
        }

        fs.unlink(eachThumbnail.filepath, function (error) {
            if (error) {
                context.logger.warn(
                    'Failed to delete thumbnail avatar file \'%s\': %s',
                    eachThumbnail.filepath,
                    error.message
                );
            }
            callback();
            return;
        });
    }, callback);
}

function getImageDimension(filepath, callback) {
    async.waterfall([function (callback) {
        im.identify(['-format', '%wx%h', filepath], callback);

    }, function (dimensionString, callback) {
        var dimensionArray = dimensionString.split('x'),
            size;

        dimensionArray[0] = parseInt(dimensionArray[0], 10);
        dimensionArray[1] = parseInt(dimensionArray[1], 10);

        callback(null, {
            width : dimensionArray[0],
            height : dimensionArray[1]
        });

    }], callback);
}

function generateThumbnailFiles(context, avatarFile, specifications, callback) {
    var thumbnails = [];

    async.waterfall([function (callback) {
        // get dimension of image
        getImageDimension(avatarFile.path, callback);

    }, function (dimension, callback) {
        // crop the image
        var size = dimension.width > dimension.height ? dimension.height : dimension.width;
        im.crop({
            srcPath: avatarFile.path,
            dstPath: avatarFile.path,
            width: size,
            height: size,
            quality: 1,
            gravity: "Center"
        }, function (error) {
            callback(error);
        });

    }, function (callback) {
        // generate thumbnails
        async.forEachSeries(specifications, function (eachSpecification, callback) {
            generateThumbnail(avatarFile, eachSpecification.size, function (error, thumbnailPath) {
                if (error) {
                    callback(error);
                    return;
                }

                thumbnails.push({
                    name : eachSpecification.name,
                    filepath : thumbnailPath,
                    contentType : avatarFile.contentType
                });
                callback();
                return;
            });
        }, callback);

    }], function (error) {
        if (error) {
            deleteThumbnailFiles(context, thumbnails, function () {
                callback(error);
            });
            return;
        }

        callback(null, thumbnails);
    });
}

function putThumbnailIntoMongodb(context, thumbnail, callback) {
    var Server = mongodb.Server,
        Db = mongodb.Db,
        GridStore = mongodb.GridStore,
        dbConfig = context.config.avatarDatabase,
        db = new Db(dbConfig.name, new Server(dbConfig.host || 'localhost', dbConfig.port || 27017, {}), { native_parser : true }),
        gridStore = new GridStore(db, thumbnail.key, 'w', {content_type : thumbnail.contentType});

    async.waterfall([ function (callback) {
        db.open(function (error) {
            callback(error);
            return;
        });

    }, function (callback) {
        gridStore.open(function (error) {
            callback(error);
            return;
        });

    }, function (callback) {
        gridStore.writeFile(thumbnail.filepath, function (error) {
            callback(error);
            return;
        });

    }, function (callback) {
        gridStore.close(function (error) {
            callback(error);
            return;
        });

    }, function (callback) {
        db.close(function (error) {
            callback(error);
            return;
        });

    }], callback);
}

function saveAvatar(context, avatar, thumbnails, callback) {
    async.waterfall([function (callback) {
        // save user avatar in assets
        var assetDao = new daos.Asset(context);
        assetDao.saveUserAvatar(avatar, callback);

    }, function (asset, callback) {
        var assetId = asset.id;
        async.forEachSeries(thumbnails, function (thumbnail, callback) {
            if (thumbnail.name) {
                thumbnail.key = 'avatar/' + assetId + '/' + thumbnail.name + '_' + avatar.fileName;
            } else {
                thumbnail.key = 'avatar/' + assetId + '/' + avatar.fileName;
            }
            putThumbnailIntoMongodb(context, thumbnail, callback);
        }, function (error) {
            if (error) {
                callback(error);
                return;
            }

            callback(null, assetId);
        });

    }], callback);
}

/**
 * Change avatar of the authenticated user.
 * Images with `jpg`, `png` and `gif` formats are allowed.
 * The max file size is 5MB.
 *
 * You should POST data as content type `multipart/form-data`.
 * Image file data must be put in the field named `avatar`.
 *
 * @param request {Request} express request object.
 * @param response {Response} express response object.
 * @param next {Function} express next function.
 */
function put(request, response, next) {
    var context = request.context,
        userDao = daos.createDao('User', context),
        userId = context.user.userId,
        avatarFile = request.files.avatar,
        attachmentId = null,
        attachmentFileName = null,
        avatarThumbnails = [],
        error;

    async.waterfall([
        function (callback) {
            validateAvatarFile(avatarFile, callback);
        },

        function (callback) {
            generateThumbnailFiles(context, avatarFile, THUMBNAIL_SPECIFICATIONS, callback);
        },

        function (thumbnails, callback) {
            var extname = path.extname(avatarFile.name),
                avatar;

            attachmentFileName = uuid.v1() + extname;
            avatar = {
                userId : userId,
                fileName : attachmentFileName,
                contentType : avatarFile.contentType
            };

            avatarThumbnails = thumbnails;
            saveAvatar(context, avatar, thumbnails, callback);
        },

        function (assetId, callback) {
            attachmentId = assetId;
            deleteThumbnailFiles(context, avatarThumbnails, callback);
        }

    ], function (error) {
        if (avatarFile && avatarFile.path) {
            fs.unlink(avatarFile.path, function (error) {
                if (error) {
                    context.logger.warn(
                        'Failed to delete temporary avatar file \'%s\': %s',
                        avatarFile.path,
                        error.message
                    );
                }
            });
        }

        if (error) {
            next(error);
            return;
        }

        var websiteUrl = context.config.websiteUrl || 'https://www.organogold.com';

        next({
            statusCode : 200,
            body : {
                "image-url" : getImageUrl(attachmentId, attachmentFileName, websiteUrl)
            }
        });
    });
}

module.exports = put;

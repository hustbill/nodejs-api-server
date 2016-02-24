// POST /v2/admin/autoships/adjustments/:id

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var mapper = require('../../../../../mapper');

function getPostData (request) {
    var body = request.body,
        postData = {
            id : request.params.id,
            active : body['active'],
            autoship_id : body['autoship-id'],
            amount : body['amount'],
            label : body['label']
        };
    return postData;
}

function generateResponse (data) {
    var result = {};
    result.body = data;
    return result;
}

/**
 *
 * create a autoship_adjustments
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function update(request, response, next) {
    var context = request.context,
        postData,
        autoshipAdjustmentDao = daos.createDao('AutoshipAdjustment', context),
        error;

    async.waterfall([
        function (callback) {
            var postData  = getPostData(request);
            if (!postData.amount && !postData.label && !u.isUndefined(postData.active)) {
                autoshipAdjustmentDao.eidtAdjustmentActive(postData, callback);
                return;
            }
            autoshipAdjustmentDao.eidtAdjustment(postData, callback);
        }
    ], function (error, data) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(data));
    });
}

module.exports = update;


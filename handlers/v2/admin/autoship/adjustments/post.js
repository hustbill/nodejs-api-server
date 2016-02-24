// POST /v2/admin/autoships/adjustments

var async = require('async');
var u = require('underscore');
var daos = require('../../../../../daos');
var utils = require('../../../../../lib/utils');
var mapper = require('../../../../../mapper');

function getPostData (request) {
    var body = request.body,
        postData = {
            active : body['active'],
            autoship_id : body['autoship-id'],
            amount : body['amount'],
            label : body['label']
        };
    return postData;
}

function validatePostData(request, callback) {
    request.check('active', 'Invalid active').notEmpty();
    request.check('autoship-id', 'Invalid autoship_id').notEmpty();
    request.check('amount', 'Invalid amount').notEmpty().isFloat();
    request.check('label', 'Invalid label').notEmpty();

    var errors = request.validationErrors();
    if (errors && errors.length > 0) {
        error = new Error(errors[0].msg);
        error.statusCode = 400;
        return callback(error);
    }
    callback(null);
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
function post(request, response, next) {
    var context = request.context,
        postData,
        autoshipAdjustmentDao = daos.createDao('AutoshipAdjustment', context),
        error;

    async.waterfall([
        function (callback) {
            validatePostData(request, callback);
        },
        function (callback) {
            var postData  = getPostData(request);
            autoshipAdjustmentDao.createAdjustment(postData, callback);
        }
    ], function (error, data) {
        if (error) {
            next(error);
            return;
        }

        next(generateResponse(data));
    });
}

module.exports = post;


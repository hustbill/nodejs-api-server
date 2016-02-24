/**
 * Get license agreement text
 */

var async = require('async');
var daos = require('../../../../daos');


function generateResult(content) {
    return {
        statusCode : 200,
        body : {
            text : content
        }
    };
}

function getRequestLanguage(request) {
    var acceptLanguage = request.get('Accept-Language'),
        languages;

    if (!acceptLanguage) {
        return 'en-US';
    }

    languages = acceptLanguage.split(',');
    return languages[0];
}


function getAgreementContent(context, countryId, callback) {
    context.readModels.DistributorAgreementDocument.find({
        where : {country_id : countryId}
    }).done(function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        if (!result) {
            callback(null, null);
            return;
        }

        callback(null, result.content);
    });
}

/**
 *
 * Get license agreement text
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        logger = context.logger,
        countryId = request.query['country-id'],
        error;

    async.waterfall([
        function(callback){
            if(!countryId){
                error = new Error('country-id is required.');
                error.errorCode = 'CountryIdIsRequired.';
                error.statusCode = 400;
            }
            callback(error);
        },
        function (callback) {
            getAgreementContent(context, countryId, callback);
        }

    ], function (error, content) {
        if (error) {
            next(error);
            return;
        }

        next(generateResult(content));
    });
}

module.exports = get;

var async = require('async');
var SocialSetting = require('../../../models/SocialSetting');

/**
 *
 * get social settings
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(req, res, next){
    var context = req.context,
        logger = context.logger,
        userId = context.user ? context.user.userId : req.query['user-id'],
        socialSetting;

        async.waterfall([
            function(callback){
                socialSetting = new SocialSetting(userId);
                socialSetting.get(context,callback);
            },
            ], function(error, result){
                if(error){
                    next(error);
                    return;
                }
                next({statusCode:200, body:result.settings});
            });
}

module.exports = get;
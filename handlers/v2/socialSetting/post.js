var async = require('async');
var SocialSetting = require('../../../models/SocialSetting');

/**
 *
 * create new social settings
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post(req, res, next){
    var context = req.context,
        logger = context.logger,
        userId = context.user.userId,
        socialSetting;

        async.waterfall([
            function(callback){
                socialSetting = new SocialSetting(userId);
                socialSetting.updateSettings(req.body);
                callback();
            },
            function(callback){
                socialSetting.saveOrUpdate(context, callback);
            }
            ], function(error, result){
                if(error){
                    next(error);
                    return;
                }
                next({statusCode:200, body:result.settings});
            });
}

module.exports = post;
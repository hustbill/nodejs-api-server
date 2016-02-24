/*
 * Social Setting validation
 */


module.exports = function(req, resp, next){
        var context = req.context,
            userId = context.user? context.user.userId: req.query['user-id'];

        ['facebook-link',
        'twitter-link',
        'instagram-link',
        'google-plus-link'].forEach(function(item){
            if(req.body[item]){
                req.check(item, 'invalid '+item).len(0, 100).isUrl();
            }
        }); 

        ['profile-image-link',
        'homepage-title'].forEach(function(item){
            if(req.body[item]){
                req.check(item, 'invalid '+item).len(0, 200);
            }
        });

        ['homepage-description',
        'contact-page-description'].forEach(function(item){
            if(req.body[item]){
                req.check(item, 'invalid '+item).len(0, 10000);
            }
        });
        
        var errors = req.validationErrors();
        if (errors && errors.length > 0) {
            error = new Error(errors[0].msg);
            error.statusCode = 400;
            return next(error);
        } else if(!userId) {
            error = new Error("user-id is required");
            error.statusCode = 400;
            return next(error);
        } else {
            next();
        }
};
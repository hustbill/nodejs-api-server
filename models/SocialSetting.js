/*
 * SocialSetting class
 */
var daos = require('../daos');
var async = require('async');
var u  = require('underscore');

 function SocialSetting( userId ){
    this.userId = userId;
    this.settings = {};
    this.settings['facebook-link'] = '';
    this.settings['twitter-link'] = '';
    this.settings['instagram-link'] = '';
    this.settings['google-plus-link'] = '';
    this.settings['profile-image-link'] = '';
    this.settings['homepage-title'] = '';
    this.settings['homepage-description'] = '';
    this.settings['contact-page-description'] = '';

 }

SocialSetting.prototype.updateSettings = function(options){
    options = options || {};
    for(var key in this.settings){
        if(u.isString(options[key])){
            this.settings[key] = options[key];
        }
    }
};

SocialSetting.prototype.get = function(context, next){
    var socialSettingDAO = daos.createDao('SocialSettingDAO', context);
    socialSettingDAO.get(this.userId, function(error, socialSetting){
        if(error){
            next(error);
            return;
        }
        next(null, socialSetting);
    });
};


SocialSetting.prototype.saveOrUpdate = function(context, next){
    var self = this;
    var socialSettingDAO = daos.createDao('SocialSettingDAO', context);
    async.waterfall([
        function(callback){
            self.get(context, callback);
        },
        function(socialSetting, callback){
            if(socialSetting && u.isNumber(socialSetting.userId)){
                //update
                socialSetting.updateSettings(self.settings);
                self = socialSetting;
                socialSettingDAO.update(socialSetting, callback);
                return;
            }else{
                socialSettingDAO.save(self, callback);
            }
            
        }
        
        ], function(error, result){
            if(error){
                next(error);
                return;
            }
            next(null, self);
    });
    
};

 module.exports = SocialSetting;

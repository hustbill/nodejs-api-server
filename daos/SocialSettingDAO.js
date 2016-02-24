/*
 * SocialSetting DAO class
 */

 var util = require('util');
var async = require('async');
var u = require('underscore');
var DAO = require('./DAO.js');
var SocialSetting = require('../models/SocialSetting');

function SocialSettingDAO(context) {
    DAO.call(this, context);
}

util.inherits(SocialSettingDAO, DAO);


SocialSettingDAO.prototype.save = function (socialSetting, callback) {
    var context = this.context,
        logger = context.logger,
        options;

        options = {
            sqlStmt: 'INSERT INTO social_settings (user_id, settings, updated_at, created_at) VALUES ($1, $2, current_timestamp, current_timestamp) ;',
            sqlParams: [socialSetting.userId, JSON.stringify(socialSetting.settings)]
        };

        this.queryDatabase(options, callback);

};

SocialSettingDAO.prototype.update = function (socialSetting, callback) {
    var context = this.context,
        logger = context.logger,
        options ;


        options = {
            sqlStmt: 'UPDATE social_settings SET settings=$1, updated_at=current_timestamp WHERE user_id=$2;',
            sqlParams: [JSON.stringify(socialSetting.settings), socialSetting.userId]
        };

        this.queryDatabase(options, callback);

};



SocialSettingDAO.prototype.get = function (userId, callback) {
    var context = this.context,
        logger = context.logger,
        options ;


        options = {
            sqlStmt: 'SELECT user_id, settings FROM social_settings WHERE user_id=$1;',
            sqlParams: [userId]
        };

        this.queryDatabase(options, function(error, result){
            if(error){
                callback(error);
                return;
            }

            if(result && u.isArray(result.rows) && result.rows.length > 0){
                var item = result.rows[0];
                var socialSetting = new SocialSetting(item.user_id);
                socialSetting.updateSettings(JSON.parse(item.settings));
                callback(null, socialSetting);
            }else{
                callback(null, {});
            }

        });

};



module.exports = SocialSettingDAO;
/**
 * Adjustment DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function AdminUserTokenRequest(context) {
    DAO.call(this, context);
}

util.inherits(AdminUserTokenRequest, DAO);

/**
 * add a record to admin_user_token_request
 * @param {Object} options
 *   options:
 *     hide_from_display {Boolean} If is admin user, need set true
 *     admin_login {Srtring} Admin user login
 *     admin_user_id {Number} Admin user id
 *     user_id {Number} The user who was logined into by admin user
 *     source_ip {String} The admin user client ip
 * @param {Function} callback
 * @return {Undefined}
 */
AdminUserTokenRequest.prototype.add = function (options, callback) {
    var self = this;
    var modelObj = {
        hide_from_display: options.hide_from_display,
        admin_user_id: options.admin_user_id,
        user_id: options.user_id,
        source_ip: options.source_ip
    };


    self.models.AdminUserTokenRequest
        .create(modelObj)
        .success(function (record) {
            callback(null, record);
        })
        .error(callback);
};


module.exports = AdminUserTokenRequest;
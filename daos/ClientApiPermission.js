/**
 * ClientApiPermission DAO class.
 */

var util = require('util');
var DAO = require('./DAO.js');

function ClientApiPermission(context) {
    DAO.call(this, context);
}

util.inherits(ClientApiPermission, DAO);


ClientApiPermission.prototype.hasPermission = function (clientId, apiName, callback) {
    var logger = this.logger;

    logger.debug('check if client has permission to call the api');
    this.models.ClientApiPermission.find({
        where : {
            client_id : clientId,
            api_name : apiName
        }
    }).success(function (permission) {
        if (!permission || !permission.allowed) {
            callback(null, false);
            return;
        }
        callback(null, true);
    }).error(callback);
};

module.exports = ClientApiPermission;

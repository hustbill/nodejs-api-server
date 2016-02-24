/**
 * ClientIdSecret DAO class.
 */

var util = require('util');
var DAO = require('./DAO.js');

function ClientIdSecret(context) {
    DAO.call(this, context);
}

util.inherits(ClientIdSecret, DAO);


ClientIdSecret.prototype.getClientIdSecretByClientId = function (clientId, callback) {
    this.models.ClientIdSecret.find({
        where : {
            client_id : clientId
        }
    }).done(callback);
};

module.exports = ClientIdSecret;

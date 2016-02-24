/**
 * OauthRegistration DAO class.
 */

var util = require('util');
var DAO = require('./DAO.js');

function OauthRegistration(context) {
    DAO.call(this, context);
}

util.inherits(OauthRegistration, DAO);


OauthRegistration.prototype.getByClientId = function (clientId, callback) {
    var options;

    options = {
        sqlStmt: 'SELECT * FROM web.oauth_registrations WHERE client_id=$1 AND active=true',
        sqlParams: [clientId]
    };

    this.queryDatabase(
        options,
        function (error, result) {
            if (error) {
                callback(error);
                return;
            }
            if (result.rows.length !== 1) {
                callback(null, null);
                return;
            }
            callback(null, result.rows[0]);
        }
    );
};

module.exports = OauthRegistration;

/**
 * Logout. Disable current authentication token
 */

var async = require('async');
var DAO = require('../../../daos/DAO');

function disableAuthToken(context, currentTokenHmacKey, callback) {
    var oauthToken = null;

    async.waterfall([
        function (callback) {
            var queryDatabaseOptions = {
                useWriteDatabase : true,
                sqlStmt : "select * from mobile.oauth_tokens where hmac_key=$1",
                sqlParams : [currentTokenHmacKey]
            };
            DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                oauthToken = result.rows[0];
                callback();
            });
        },

        function (callback) {
            if (!oauthToken || !oauthToken.active) {
                callback();
                return;
            }

            var queryDatabaseOptions = {
                useWriteDatabase : true,
                sqlStmt : "update mobile.oauth_tokens set active=false, updated_at=now() where hmac_key=$1",
                sqlParams : [currentTokenHmacKey]
            };
            DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                if (error) {
                    callback(error);
                    return;
                }
                callback();
            });
        },

        function (callback) {
            if (!oauthToken) {
                callback();
                return;
            }

            var queryDatabaseOptions = {
                useWriteDatabase : true,
                sqlStmt : "update mobile.devices set active=false, updated_at=now() where distributor_id=$1 and device_id=$2",
                sqlParams : [oauthToken.distributor_id, oauthToken.device_id]
            };
            DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                if (error) {
                    callback(error);
                    return;
                }
                callback();
            });
        }
    ], callback);
}

function post(request, response, next) {
    var context = request.context,
        hmacKey = context.user.hmacKey,
        error;

    disableAuthToken(context, hmacKey, function (error) {
        if (error) {
            next(error);
            return;
        }
        next({statusCode: 200});
    });
}

module.exports = post;

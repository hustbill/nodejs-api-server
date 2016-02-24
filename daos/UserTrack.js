/**
 * UserTrack DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function UserTrack(context) {
    DAO.call(this, context);
}

util.inherits(UserTrack, DAO);


UserTrack.prototype.addUserTrack = function (userTrack, callback) {
    var options = {
            useWriteDatabase : true,
            sqlStmt: 'INSERT INTO user_tracks (user_id, sign_in_at, sign_in_ip) VALUES ($1, $2, $3)',
            sqlParams: [userTrack.userId, userTrack.signInAt, userTrack.signInIP]
        };

    this.queryDatabase(options, function (error) {
        callback(error);
    });
};

module.exports = UserTrack;

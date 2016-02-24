/**
 * Roleship DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function Roleship(context) {
    DAO.call(this, context);
}

util.inherits(Roleship, DAO);


/*
 *  options = {
 *      sourceRoleId : <Integer>
 *      destinationRoleId : <Integer>
 *      catalogId : <Integer>
 *  }
 */
Roleship.prototype.validatePermission = function (options, callback) {
    var context = this.context;

    async.waterfall([
        function (callback) {
            context.readModels.Roleship.find({
                where : {
                    source_role_id : options.sourceRoleId,
                    destination_role_id : options.destinationRoleId,
                    catalog_id : options.catalogId
                }
            }).done(callback);
        },

        function (roleship, callback) {
            callback(null, !!roleship);
        }
    ], callback);
};

module.exports = Roleship;

/**
 * UsersShipAddress DAO class.
 */

var util = require('util');
var async = require('async');
var u = require('underscore');
var DAO = require('./DAO');
var daos = require('./index');
var utils = require('../lib/utils');
var ups = require('../lib/ups');
var AddressDao = require('./Address');

function UsersShipAddress(context) {
    DAO.call(this, context);
}

util.inherits(UsersShipAddress, DAO);

UsersShipAddress.prototype.updateActiveColumn = function (user_id, address_id, isActive, callback) {
    var self = this,
        logger = this.context.logger,
        options;

    logger.debug("Update users_ship_addresses table column active.");
    options = {
        sqlStmt: " update users_ship_addresses set active = $1 where user_id = $2 and address_id = $3 ",
        sqlParams: [isActive, user_id, address_id]
    };

    self.queryDatabase(options, callback);
};

UsersShipAddress.prototype.setNotDefault = function (user_id, callback) {
    var self = this,
        logger = this.context.logger,
        options;

    logger.debug("Update other users_ship_addresses record default column to false.");
    options = {
        sqlStmt: " update users_ship_addresses set is_default = false where user_id = $1",
        sqlParams: [user_id]
    };

    self.queryDatabase(options, callback);
};

UsersShipAddress.prototype.insertUsersShipAddress = function (usersShipAddressData, callback) {
    var self = this,
        logger = this.context.logger,
        usersShipAddressFactory = this.models.UsersShipAddress,
        resUsersShipAddress;

    async.waterfall([
        function (next) {
            if(usersShipAddressData.is_default === true){
                self.setNotDefault(usersShipAddressData.user_id, function (error){
                    if(error) {
                        next(error);
                        return;
                    }
                    next(null);
                });
            }
            else{
                next(null);
            }
        },

        function (next) {
            usersShipAddressFactory.create(usersShipAddressData).success(function(usersShipAddress) {
                callback(null, usersShipAddress);
            }).error(callback);
        }
    ],callback);
};

UsersShipAddress.prototype.getSameShipAddress = function (user_id, addressData, callback) {
    var self = this,
        logger = this.context.logger,
        options = {},
        whereSql = [],
        tmpSqlArray = [],
        addressKeysToCompare = AddressDao.ADDRESS_KEYS_TO_COMPARE,
        pos = 2,
        value;

    options.sqlStmt = "";
    options.sqlParams = [];
    tmpSqlArray.push(" select * from addresses where id in (select address_id from users_ship_addresses where user_id = $1 and active = true)  ");
    options.sqlParams.push(user_id);

    for(var i=0; i < addressKeysToCompare.length; i++) {
        value = addressData[addressKeysToCompare[i]];
        if(value !== null){
            tmpSqlArray.push(" and " + addressKeysToCompare[i] + "=$" + pos);
            options.sqlParams.push(value);
            pos++;
        }
        else{
            tmpSqlArray.push(" and " + addressKeysToCompare[i] + " is null ");
        }
    }
    options.sqlStmt = tmpSqlArray.join(' ');
    self.queryDatabase(options, callback);
};

UsersShipAddress.prototype.saveUserShipAddress = function (user, address, isActive, isDefault, callback) {
    var self = this,
        logger = this.context.logger,
        usersShipAddressFactory = this.models.UsersShipAddress,
        options,
        error;
    if(!user || !user.id){
        error = new Error("User data Error.");
        error.errorCode = "InvalidUserData";
        error.statusCode = 400;
        return callback(error);
    }

    if(!address || !address.id){
        error = new Error("Address data Error.");
        error.errorCode = "InvalidAddressData";
        error.statusCode = 400;
        return callback(error);
    }

    async.waterfall([
        function (next) {
            //check is exist or not
            options = {
                sqlStmt: "select active from users_ship_addresses where user_id = $1 and address_id = $2 limit 1",
                sqlParams: [user.id, address.id]
            };
            self.queryDatabase(options, function (error, result){
                if(error){
                    callback(error);
                    return;
                }
                
                if(result && result.rows.length >= 1){
                    if(result.rows[0].active === isActive){
                        logger.debug("already existed user_ship_address record. user_id:%s , address_id: %s", user.id, address.id);
                        callback(null);
                        return;
                    }
                    else{
                        self.updateActiveColumn(user.id, address.id, isActive, callback);
                        return;
                    }
                }

                next(null);
            });
        },

        function (next) {
            var usersShipAddressData = {
                user_id:  user.id,
                address_id: address.id,
                is_default: isDefault,
                active: isActive,
                created_at: new Date()
            };

            logger.debug("Saving usersShipAddress data to database...");
            self.insertUsersShipAddress(usersShipAddressData, next);
        }
    ], callback);

};

module.exports = UsersShipAddress;
/**
 * User DAO class.
 */

var util = require('util');
var async = require('async');
var u = require('underscore');
var DAO = require('./DAO.js');
var daos = require('./index.js');
var utils = require('../lib/utils');
var random = require('../lib/random');
var cacheKey = require('../lib/cacheKey');
var constants = require('../lib/constants');
var mapper = require('../mapper');

function User(context) {
    DAO.call(this, context);
}

util.inherits(User, DAO);

User.prototype.getProfileByDistributorId = function (distributorId, callback) {
    var options;

    options = {
        cache : {
            key : cacheKey.profile(distributorId),
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_profile_info($1)',
        sqlParams: [distributorId]
    };

    this.queryDatabase(options, callback);
};

function getUserAddressId(context, userId, addressType, callback) {
    var tableName = "users_" + addressType + "_addresses",
        queryDatabaseOptions = {
            sqlStmt : "select * from " + tableName + " where user_id=$1 and is_default=true;",
            sqlParams : [userId]
        };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        var rows = result.rows;
        if (!rows || !rows.length) {
            callback(null, null);
            return;
        }

        callback(null, rows[0].address_id);
    });
}

function getUserHomeAddressId(context, userId, callback) {
    getUserAddressId(context, userId, 'home', callback);
}

function getUserShippingAddressId(context, userId, callback) {
    getUserAddressId(context, userId, 'ship', callback);
}

function getUserBillingAddressId(context, userId, callback) {
    getUserAddressId(context, userId, 'bill', callback);
}

function getUserWebsiteAddressId(context, userId, callback) {
    getUserAddressId(context, userId, 'web', callback);
}

User.prototype.getAddressIds = function (userId, callback) {
    var context = this.context,
        User = this.readModels.User,
        user,
        addressIds = {};

    async.waterfall([
        function (callback) {
            User.find(userId).done(callback);
        },

        function (result, callback) {
            user = result;

            if (!user) {
                callback(new Error('Cannot find user with id: ' +  userId));
                return;
            }

            getUserHomeAddressId(context, user.id, function (error, addressId) {
                if (error) {
                    callback(error);
                    return;
                }

                addressIds.home_address_id = addressId;
                callback();
            });
        },

        function (callback) {
            getUserShippingAddressId(context, user.id, function (error, addressId) {
                if (error) {
                    callback(error);
                    return;
                }

                addressIds.ship_address_id = addressId;
                callback();
            });
        },

        function (callback) {
            getUserBillingAddressId(context, user.id, function (error, addressId) {
                if (error) {
                    callback(error);
                    return;
                }

                addressIds.bill_address_id = addressId;
                callback();
            });
        },

        function (callback) {
            getUserWebsiteAddressId(context, user.id, function (error, addressId) {
                if (error) {
                    callback(error);
                    return;
                }

                addressIds.web_address_id = addressId;
                callback();
            });
        }
    ], callback);
};

User.prototype.getCountryISOByUserId = function (userId, callback) {
    var self = this,
        context = this.context,
        User = this.readModels.User;

    async.waterfall([
        function (next) {
            User.find(userId).success(function (user) {
                if (!user) {
                    next(new Error('Cannot find user with id: ' +  userId));
                    return;
                }

                next(null, user);
            }).error(next);
        },
        function (user, next) {
            self.getHomeAddressOfUser(user, function (error, address) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!address) {
                    next(new Error(
                        'Cannot find home address of user: ' + user.id
                    ));
                    return;
                }

                next(null, address);
            });
        },
        function (address, next) {
            var addressDao = daos.createDao('Address', context);
            addressDao.getCountryOfAddress(address, function (error, country) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!country) {
                    next(new Error(
                        'Cannot find country with id: ' + address.country_id
                    ));
                    return;
                }

                next(null, country);
            });
        }
    ], function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, result.iso);
    });
};

function changeUserAddressId(userId, addressId, addressType, callback) {
    if (!userId) {
        callback(new Error('User id required.'));
        return;
    }

    if (!addressId) {
        callback(new Error('Address id required.'));
        return;
    }

    var context = this.context,
        User = this.models.User,
        Address = this.models.Address,
        addressTableName = "users_" + addressType + "_addresses";

    async.waterfall([
        function (next) {
            // validate user id
            User.find(userId).success(function (user) {
                if (!user) {
                    next(new Error('Cannot find user with id: ' +  userId));
                    return;
                }

                next();
            }).error(next);
        },

        function (next) {
            // validate address id
            Address.find(addressId).success(function (address) {
                if (!address) {
                    next(new Error('Cannot find address with id: ' +  addressId));
                    return;
                }

                next();
            }).error(next);
        },

        function (callback) {
            // set is_default of other addresses as false
            var sqlStmt = "update " + addressTableName + " set is_default = false, updated_at = now() where user_id = $1 and address_id != $2",
                sqlParams = [userId, addressId];

            context.databaseClient.query(sqlStmt, sqlParams, function (error) {
                callback(error);
            });
        },

        function (callback) {
            var sqlStmt = "select * from " + addressTableName + " where user_id=$1 and address_id=$2",
                sqlParams = [userId, addressId];
            context.databaseClient.query(sqlStmt, sqlParams, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, result.rows[0]);
            });
        },

        function (address, callback) {
            var sqlStmt,
                sqlParams;

            if (address) {
                // update
                sqlStmt = "update " + addressTableName + " set is_default = true, active = true, updated_at = now() where user_id = $1 and address_id = $2";
            } else {
                // insert
                sqlStmt = "insert into " + addressTableName + "(user_id, address_id, is_default, active, created_at, updated_at) values ($1, $2, true, true, now(), now())";
            }
            sqlParams = [userId, addressId];

            context.databaseClient.query(sqlStmt, sqlParams, function (error) {
                callback(error);
            });
        }

    ], callback);
}

User.prototype.changeHomeAddressId = function (userId, addressId, callback) {
    changeUserAddressId.call(this, userId, addressId, 'home', callback);
};

User.prototype.changeBillingAddressId = function (userId, addressId, callback) {
    changeUserAddressId.call(this, userId, addressId, 'bill', callback);
};

User.prototype.changeShippingAddressId = function (userId, addressId, callback) {
    changeUserAddressId.call(this, userId, addressId, 'ship', callback);
};

User.prototype.changeWebsiteAddressId = function (userId, addressId, callback) {
    changeUserAddressId.call(this, userId, addressId, 'web', callback);
};


User.prototype.getCountryOfUser = function (user, callback) {
    var self = this,
        addressDao = daos.createDao('Address', this.context);

    async.waterfall([
        function (callback) {
            self.getSoldAddressOfUser(user, callback);
        },

        function (soldAddress, callback) {
            if (!soldAddress) {
                callback(null, null);
                return;
            }

            addressDao.getCountryOfAddress(soldAddress, callback);
        }
    ], callback);
};


/**
 * Get roles of user.
 *
 * callback prototype:
 * callback(error)
 *
 * @method getRolesOfUser
 * @param id {String} user id
 * @param callback {Function} callback function.
 */
User.prototype.getRolesOfUser = function (user, callback) {
    if (user.roles) {
        callback(null, user.roles);
        return;
    }

    var self = this;

    async.waterfall([
        function (callback) {
            var options = {
                sqlStmt: 'SELECT role_id, user_id FROM roles_users WHERE user_id=$1',
                sqlParams: [user.id]
            };
            self.queryDatabase(options, callback);
        },

        function (result, callback) {
            var roleDao = daos.createDao('Role', self.context),
                roleIds = result.rows.map(function (row) {
                    return row.role_id;
                });

            async.mapSeries(roleIds, function (roleId, callback) {
                roleDao.getRoleById(roleId, callback);
            }, callback);
        }
    ], callback);
};


User.prototype.isUserInRole = function (user, roleName, callback) {
    this.getRolesOfUser(user, function (error, roles) {
        if (error) {
            callback(error);
            return;
        }

        var role,
            i;

        for (i = 0; i < roles.length; i += 1) {
            role = roles[i];
            if (role.name === roleName) {
                callback(null, true);
                return;
            }
        }
        callback(null, false);
    });
};


User.prototype.isUserInRoleByCode = function (user, roleCode, callback) {
    this.getRolesOfUser(user, function (error, roles) {
        if (error) {
            callback(error);
            return;
        }

        var role,
            i;

        for (i = 0; i < roles.length; i += 1) {
            role = roles[i];
            if (role.role_code === roleCode) {
                callback(null, true);
                return;
            }
        }
        callback(null, false);
    });
};


User.prototype.isUserInAnyRolesByCode = function (user, roleCodes, callback) {
    this.getRolesOfUser(user, function (error, roles) {
        if (error) {
            callback(error);
            return;
        }

        var role,
            i;

        for (i = 0; i < roles.length; i += 1) {
            role = roles[i];
            if (roleCodes.indexOf(role.role_code) !== -1) {
                callback(null, true);
                return;
            }
        }
        callback(null, false);
    });
};


User.prototype.isUserWithStatusByName = function (user, statusName, callback) {
    var context = this.context;

    async.waterfall([
        function (callback) {
            var statusDao = daos.createDao('Status', context);
            statusDao.getStatusByName(statusName, callback);
        },

        function (status, callback) {
            if (!status) {
                callback(null, false);
                return;
            }
            context.logger.debug('staus.id', status.id, 'user.status_id:', user.status_id);
            callback(null, (status.id === user.status_id));
        }
    ], callback);
};


User.prototype.isUserDisabled = function (user, callback) {
    if (!user.status_id) {
        callback(null, true);
        return;
    }

    var self = this,
        statusNames = ['Cancelled', 'Inactive', 'Suspended', 'Terminated', 'Unregistered', 'Revoked'];

    async.forEachSeries(statusNames, function (statusName, next) {
        self.isUserWithStatusByName(user, statusName, function (error, withStatus) {
            if (error) {
                callback(error);
                return;
            }

            if (withStatus) {
                callback(null, true);
                return;
            }

            next();
        });

    }, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, false);
    });
};


User.prototype.isUserDisabledById = function (userId, callback) {
    var self = this;

    async.waterfall([
        function (callback) {
            self.getById(userId, callback);
        },

        function (user, callback) {
            self.isUserDisabled(user, callback);
        }
    ], callback);
};


User.prototype.isDistributor = function (user, callback) {
    this.isUserInRoleByCode(user, 'D', callback);
};


User.prototype.isRetailCustomer = function (user, callback) {
    this.isUserInRoleByCode(user, 'R', callback);
};


User.prototype.isPreferredCustomer = function (user, callback) {
    this.isUserInRole(user, 'Preferred Customer', callback);
};


User.prototype.isUserUnregistered = function (user, callback) {
    this.isUserWithStatusByName(user, 'Unregistered', callback);
};


User.prototype.isUserRegistered = function (user, callback) {
    var self = this,
        context = this.context;

    async.waterfall([
        function (callback) {
            self.isUserUnregistered(user, callback);
        },

        function (isUnregistered, callback) {
            if (!isUnregistered) {
                callback(null, true);
                return;
            }

            var orderDao = daos.createDao('Order', context);
            orderDao.hasCompletedOrderByUserId(user.id, function (error, hasCompletedOrder) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, hasCompletedOrder);
            });
        }
    ], callback);
};


User.prototype.isUserRegisteredById = function (userId, callback) {
    var self = this,
        context = this.context;

    async.waterfall([
        function (callback) {
            context.readModels.User.find(userId).done(callback);
        },

        function (user, callback) {
            self.isUserRegistered(user, callback);
        }
    ], callback);
};


User.prototype.getDistributorOfUser = function (user, callback) {
    if (user.distributor) {
        callback(null, user.distributor);
        return;
    }

    var context = this.context,
        distributorDao = daos.createDao('Distributor', context);

    distributorDao.getDistributorByUserId(user.id, function (error, distributor) {
        if (error) {
            callback(error);
            return;
        }

        user.distributor = distributor;
        callback(null, distributor);
    });
};


User.prototype.addRoleOfUserByRoleCode = function (user, roleCode, callback) {
    var self = this,
        context = this.context,
        roleDao = daos.createDao('Role', context);

    async.waterfall([
        function (callback) {
            roleDao.getRoleByCode(roleCode, callback);
        },

        function (role, callback) {
            var options,
                error;

            if (!role) {
                error = new Error("Role with code '" + roleCode + "' was not found.");
                error.errorCode = 'InvalidRoleCode';
                error.statusCode = 400;
                callback(error);
                return;
            }

            options = {
                sqlStmt : "insert into roles_users (role_id, user_id, created_at, updated_at) values ($1, $2, now(), now())",
                sqlParams : [role.id, user.id],
                useWriteDatabase : true
            };
            self.queryDatabase(options, function (error) {
                if (error) {
                    callback();
                    return;
                }

                callback();
            });
        }
    ], callback);
};


User.prototype.removeRoleOfUserByRoleCode = function (user, roleCode, callback) {
    var self = this,
        context = this.context,
        roleDao = daos.createDao('Role', context);

    async.waterfall([
        function (callback) {
            roleDao.getRoleByCode(roleCode, callback);
        },

        function (role, callback) {
            var options = {
                    sqlStmt : "delete from roles_users where role_id=$1 and user_id=$2",
                    sqlParams : [role.id, user.id],
                    useWriteDatabase : true
                };
            self.queryDatabase(options, function (error) {
                if (error) {
                    callback();
                    return;
                }

                callback();
            });
        }
    ], callback);
};


User.prototype.removeRoleOfUserByRoleName = function (user, roleName, callback) {
    var self = this,
        context = this.context,
        roleDao = daos.createDao('Role', context);

    async.waterfall([
        function (callback) {
            roleDao.getRoleByName(roleName, callback);
        },

        function (role, callback) {
            var options = {
                    sqlStmt : "delete from roles_users where role_id=$1 and user_id=$2",
                    sqlParams : [role.id, user.id],
                    useWriteDatabase : true
                };
            self.queryDatabase(options, function (error) {
                if (error) {
                    callback();
                    return;
                }

                callback();
            });
        }
    ], callback);
};


User.prototype.changeRoleOfUserByRoleCode = function (user, newRoleCode, callback) {
    var self = this,
        context = this.context,
        roleDao = daos.createDao('Role', context),
        oldRole,
        newRole;

    async.waterfall([
        function (next) {
            self.getRolesOfUser(user, function (error, roles) {
                if (error) {
                    callback(error);
                    return;
                }

                if (roles.length) {
                    oldRole = roles[0];
                }

                if (oldRole.role_code === newRoleCode) {
                    callback();
                    return;
                }

                next();
            });
        },

        function (callback) {
            roleDao.getRoleByCode(newRoleCode, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                newRole = result;
                if (!newRole) {
                    error = new Error("Role with code '" + newRoleCode + "' was not found.");
                    error.errorCode = 'InvalidRoleCode';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            var options = {
                    sqlStmt : "insert into roles_users (role_id, user_id, created_at, updated_at) values ($1, $2, now(), now())",
                    sqlParams : [newRole.id, user.id],
                    useWriteDatabase : true
                };
            DAO.queryDatabase(context, options, function (error) {
                callback(error);
            });
        },

        function (callback) {
            if (!oldRole) {
                callback(error);
                return;
            }

            var options = {
                    sqlStmt : "delete from roles_users where role_id=$1 and user_id=$2",
                    sqlParams : [oldRole.id, user.id],
                    useWriteDatabase : true
                };
            DAO.queryDatabase(context, options, function (error) {
                callback(error);
            });
        },

        function (callback) {
            if (!oldRole) {
                callback(error);
                return;
            }

            var options = {
                    sqlStmt : "insert into user_role_changes (user_id, old_role_id, new_role_id, created_at, updated_at) values ($1, $2, $3, now(), now())",
                    sqlParams : [user.id, oldRole.id, newRole.id],
                    useWriteDatabase : true
                };
            DAO.queryDatabase(context, options, function (error) {
                callback(error);
            });
        }
    ], callback);
};


function trackUserStatusChanges(options, callback){
    var context = options.context;
    var logger = context.logger;
    var userId = options.userId;
    var oldStatusId = options.oldStatusId;
    var newStatusId = options.newStatusId;
    var notes = options.notes || '';
    var sqlStmt = '';

    if(oldStatusId === newStatusId){
        //skip
        logger.info('skip, status_id does not changes, status_id:%d', newStatusId);
        callback(null, null);
        return;
    }

    sqlStmt += ' INSERT INTO user_status_changes (user_id, old_status_id, new_status_id, notes, created_at, updated_at) ';
    sqlStmt += ' VALUES ($1, $2, $3, $4, now(), now())';

    DAO.queryDatabase(context, {
        sqlStmt: sqlStmt,
        sqlParams: [userId, oldStatusId, newStatusId, notes]
    }, function(error, result) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, result);
    });

}

User.prototype.setStatusOfUserByStatusName = function (user, statusName, callback) {
    var context = this.context;
    var oldStatusId = user.status_id;
    var newStatusId;

    async.waterfall([
        function (callback) {
            var statusDao = daos.createDao('Status', context);
            statusDao.getStatusByName(statusName, callback);
        },

        function (status, callback) {
            if (!status) {
                var error = new Error('Invalid status name.');
                error.errorCode = 'InvalidStatusName';
                callback(error);
                return;
            }

            if (user.status_id === status.id) {
                callback();
                return;
            }
            newStatusId = status.id;
            user.status_id = status.id;
            user.save(['status_id']).done(function (error) {
                callback(error);
            });
        },

        function(callback){

            if (!newStatusId) {
                callback();
                return;
            }
            //log status changes
            trackUserStatusChanges({
                context: context,
                userId: user.id,
                oldStatusId: oldStatusId,
                newStatusId: newStatusId
            }, callback);
        },
        function(result, callback){
            callback();
        }
    ], callback);
};


User.prototype.isDistributorRenewalDue = function (user, callback) {
    var self = this,
        distributor;

    async.waterfall([
        function (callback) {
            self.getDistributorOfUser(user, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                distributor = result;
                callback();
            });
        },

        function (next) {
            if (distributor.lifetime_rank < constants.getRankNumberByName('Retail Customer')) {
                callback(null, false);
                return;
            }

            self.isDistributor(user, function (error, isDistributor) {
                if (error) {
                    callback(error);
                    return;
                }

                if (isDistributor) {
                    next();
                    return;
                }

                self.isPreferredCustomer(user, function (error, isPreferredCustomer) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (isPreferredCustomer) {
                        next();
                        return;
                    }

                    callback(null, false);
                });
            });
        },

        function (callback) {
            var context = self.context,
                distributorRenewalDays = context.config.distributorRenewalDays || 5,
                now = new Date(),
                renewalDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + distributorRenewalDays),
                nextRenewalDate = distributor.next_renewal_date,
                entryDate;

            if (!nextRenewalDate) {
                entryDate = distributor.entry_date;

                if (entryDate) {
                    nextRenewalDate = new Date(entryDate.getFullYear() + 1, entryDate.getMonth(), entryDate.getDate());
                } else {
                    nextRenewalDate = now;
                }
            }

            callback(null, nextRenewalDate < renewalDate);
        }
    ], callback);
};


User.prototype.getBoughtVariantIdsOfUser = function (user, callback) {
    // new users bought nothing.
    if (!user.id) {
        callback(null, []);
        return;
    }

    var options = {
            sqlStmt : "select distinct l.variant_id from line_items l inner join orders o on l.order_id = o.id where o.user_id= $1 and o.state = 'complete' and o.payment_state = 'paid';",
            sqlParams : [user.id]
        };

    this.queryDatabase(options, function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, result.rows.map(function (row) {
            return row.variant_id;
        }));
    });
};


function validateProfileAddress(addressDao, validator, address, addressType, callback) {
    if (!address) {
        callback(null, null);
        return;
    }

    async.waterfall([
        function (callback) {
            validator.call(addressDao, address, callback);
        },

        function (failures, callback) {
            if (failures && failures.length) {
                var result = {
                    data : mapper[addressType].call(mapper, address),
                    failures : failures
                };
                callback(null, result);
                return;
            }

            callback(null, null);
        }
    ], callback);
}


User.prototype.validateProfileAddressesOfUser = function (user, callback) {
    var self = this,
        context = this.context,
        addressDao = daos.createDao('Address', context);

    async.waterfall([
        function (callback) {
            self.getAddressesOfUser(user, callback);
        },

        function (addresses, callback) {
            async.series({
                homeAddress : validateProfileAddress.bind(this, addressDao, addressDao.validateHomeAddress, addresses.home, 'homeAddress'),
                billingAddress : validateProfileAddress.bind(this, addressDao, addressDao.validateBillingAddress, addresses.billing, 'billingAddress'),
                shippingAddress : validateProfileAddress.bind(this, addressDao, addressDao.validateShippingAddress, addresses.shipping, 'shippingAddress')
            }, callback);
        }
    ], callback);
};


User.prototype.getAddressesOfUser = function (user, callback) {
    var context = this.context,
        addressDao = daos.createDao('Address', context),
        addressIds = [],
        homeAddressId,
        billingAddressId,
        shippingAddressId,
        websiteAddressId;

    async.waterfall([
        function (callback) {
            if (user.homeAddress) {
                callback();
                return;
            }

            getUserHomeAddressId(context, user.id, function (error, addressId) {
                if (error) {
                    callback(error);
                    return;
                }

                if (addressId) {
                    homeAddressId = addressId;
                    addressIds.push(addressId);
                }
                callback();
            });
        },

        function (callback) {
            if (user.billingAddress) {
                callback();
                return;
            }

            getUserBillingAddressId(context, user.id, function (error, addressId) {
                if (error) {
                    callback(error);
                    return;
                }

                if (addressId) {
                    billingAddressId = addressId;
                    addressIds.push(addressId);
                }
                callback();
            });
        },

        function (callback) {
            if (user.shippingAddress) {
                callback();
                return;
            }

            getUserShippingAddressId(context, user.id, function (error, addressId) {
                if (error) {
                    callback(error);
                    return;
                }

                if (addressId) {
                    shippingAddressId = addressId;
                    addressIds.push(addressId);
                }
                callback();
            });
        },

        function (callback) {
            if (user.websiteAddress) {
                callback();
                return;
            }

            getUserWebsiteAddressId(context, user.id, function (error, addressId) {
                if (error) {
                    callback(error);
                    return;
                }

                if (addressId) {
                    websiteAddressId = addressId;
                    addressIds.push(addressId);
                }
                callback();
            });
        },

        function (callback) {
            if (addressIds.length) {
                addressDao.getAddressesById(addressIds, callback);
            } else {
                callback(null, []);
            }
        },

        function (addresses, callback) {
            var addressMap = {},
                result;

            addresses.forEach(function (address) {
                addressMap[address.id] = address;
            });

            if (!user.homeAddress && homeAddressId) {
                user.homeAddress = addressMap[homeAddressId];
            }
            if (!user.billingAddress && billingAddressId) {
                user.billingAddress = addressMap[billingAddressId];
            }
            if (!user.shippingAddress && shippingAddressId) {
                user.shippingAddress = addressMap[shippingAddressId];
            }
            if (!user.websiteAddress && websiteAddressId) {
                user.websiteAddress = addressMap[websiteAddressId];
            }

            result = {
                home : user.homeAddress,
                billing : user.billingAddress,
                shipping : user.shippingAddress,
                website : user.websiteAddress
            };

            callback(null, result);
        }
    ], callback);
};


function generateGetAddressOfUserFunction(addressType, addressFieldName) {
    return function (user, callback) {
        if (user[addressFieldName]) {
            callback(null, user[addressFieldName]);
            return;
        }

        var context = this.context,
            addressDao = daos.createDao('Address', context);

        async.waterfall([
            function (callback) {
                getUserAddressId(context, user.id, addressType, callback);
            },

            function (addressId, callback) {
                if (!addressId) {
                    callback(null, null);
                    return;
                }

                addressDao.getAddressById(addressId, callback);
            },

            function (address, callback) {
                user[addressFieldName] = address;
                callback(null, address);
            }
        ], callback);
    };
}


User.prototype.getHomeAddressOfUser = User.prototype.getSoldAddressOfUser = generateGetAddressOfUserFunction('home', 'homeAddress');
User.prototype.getShippingAddressOfUser = generateGetAddressOfUserFunction('ship', 'shippingAddress');
User.prototype.getBillingAddressOfUser = generateGetAddressOfUserFunction('bill', 'billingAddress');
User.prototype.getWebsiteAddressOfUser = generateGetAddressOfUserFunction('web', 'websiteAddress');


User.prototype.getUserByEmail = function (email, callback) {
    email = email.toLowerCase();

    this.readModels.User.find({
        where : {email : email}
    }).done(callback);
};


User.prototype.getUserByLogin = function (login, callback) {
    this.readModels.User.find({
        where : {login : login}
    }).done(callback);
};

User.prototype.getUserById = function (id, callback) {
    this.readModels.User.find({
        where: {id: id}
    }).done(callback);
};

User.prototype.getUserByOptions = function (options, callback) {
    var cond = {where:{}};
    if(u.isNumber(options.userId)){
        cond.where.id = options.userId;
    }else if(u.isString(options.login)){
        cond.where.login = options.login;
    }else{
        var error = new Error("invalid login or userId");
        error.statusCode = 400;
        error.errorCode = "InvalidLoginOrId";
        callback(error);
        return;
    }

    this.readModels.User.find(cond).done(callback);
};


function removeRecordsRelatedToUserId(context, tableName, userId, callback) {
    var options = {
            useWriteDatabase : true,
            sqlStmt : "DELETE FROM " + tableName + " WHERE user_id = $1;",
            sqlParams : [userId]
        };
    DAO.queryDatabase(context, options, function (error) {
        callback(error);
    });
}

function removeUserById(context, userId, callback) {
    async.waterfall([
        function (callback) {
            var tablesRelatedToUser = [
                'distributors',
                'roles_users',
                'users_home_addresses',
                'users_ship_addresses',
                'users_bill_addresses',
                'users_web_addresses'
            ];
            async.forEachSeries(tablesRelatedToUser, function (eachTable, callback) {
                removeRecordsRelatedToUserId(context, eachTable, userId, callback);
            }, function (error) {
                callback(error);
            });
        },

        function (callback) {
            // delete orders
            var options = {
                    useWriteDatabase : true,
                    sqlStmt : "SELECT * FROM orders WHERE user_id = $1;",
                    sqlParams : [userId]
                };
            DAO.queryDatabase(context, options, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!result.rows || !result.rows.length) {
                    callback();
                    return;
                }

                var orderDao = daos.createDao('Order', context);
                async.forEachSeries(result.rows, function (order, callback) {
                    orderDao.deleteOrderById(order.id, callback);
                }, function (error) {
                    callback(error);
                });
            });
        },

        function (callback) {
            // delete autoships
            var options = {
                    useWriteDatabase : true,
                    sqlStmt : "SELECT * FROM autoships WHERE user_id = $1;",
                    sqlParams : [userId]
                };
            DAO.queryDatabase(context, options, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!result.rows || !result.rows.length) {
                    callback();
                    return;
                }

                var autoshipDao = daos.createDao('Autoship', context);
                async.forEachSeries(result.rows, function (autoship, callback) {
                    autoshipDao.deleteAutoshipById(autoship.id, callback);
                }, function (error) {
                    callback(error);
                });
            });
        },

        function (callback) {
            var options = {
                    useWriteDatabase : true,
                    sqlStmt : "DELETE FROM users WHERE id = $1;",
                    sqlParams : [userId]
                };
            DAO.queryDatabase(context, options, function (error) {
                callback(error);
            });
        }
    ], callback);
}

function saveSecurityQuestionForUser(context, user, options, callback) {
    var securityQuestionDao,
        error;

    if (!options.id && !options.question) {
        error = new Error('Security question is required.');
        error.errorCode = 'InvalidSecurityQuestion';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!options.answer) {
        error = new Error('Security answer is required.');
        error.errorCode = 'InvalidSecurityAnswer';
        error.statusCode = 400;
        callback(error);
        return;
    }

    securityQuestionDao = daos.createDao('SecurityQuestion', context);

    async.waterfall([
        function (callback) {
            if (options.id) {
                securityQuestionDao.getSecurityQuestionById(options.id, function (error, securityQuestion) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!securityQuestion.is_default) {
                        error = new Error("Security question " + options.id + " is not a default question.");
                        error.errorCode = 'InvalidSecurityQuestion';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    callback(null, securityQuestion);
                });
            } else {
                securityQuestionDao.createSecurityQuestion({question : options.question}, callback);
            }
        },

        function (securityQuestion, callback) {
            var sqlStmt = "insert into security_questions_answers (security_question_id, user_id, answer, created_at, updated_at) values ($1, $2, $3, now(), now())",
                sqlParams = [securityQuestion.id, user.id, options.answer];

            context.logger.trace(
                'Executing sql query: %s with sqlParams %j',
                sqlStmt,
                sqlParams
            );

            context.databaseClient.query(sqlStmt, sqlParams, function (error, result) {
                callback(error);
            });
        }
    ], callback);
}


function validateUserLogin(context, login, callback) {
    var failures = [];

    if (/^\d+$/.test(login)) {
        failures.push('Login can not be all numbers.');
    }

    if (/\s/.test(login)) {
        failures.push('Login can not contain white space.');
    }

    callback(null, failures);
}


User.prototype.createUser = function (user, callback) {
    var self = this,
        context = this.context,
        contextOfNewUser = {},
        newUser,
        newUserDao,
        addressDao,
        error;

    if (!user.login) {
        error = new Error('Login is required.');
        error.errorCode = 'InvalidLogin';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!user.password) {
        error = new Error('Password is required.');
        error.errorCode = 'InvalidPassword';
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (!user.email) {
        error = new Error('Email is required.');
        error.errorCode = 'InvalidEmail';
        error.statusCode = 400;
        callback(error);
        return;
    }

    user.login = user.login.toLowerCase();
    user.email = user.email.toLowerCase();

    async.waterfall([
        function (callback) {
            validateUserLogin(context, user.login, function (error, failures) {
                if (error) {
                    callback(error);
                    return;
                }

                if (failures.length) {
                    error = new Error(failures[0]);
                    error.errorCode = 'InvalidLogin';
                    error.statusCode = 400;
                    callback(error);
                }

                callback();
            });
        },

        function (callback) {
            // check login
            context.models.User.find({
                where : {login : user.login}
            }).success(function (existsUser) {
                if (!existsUser) {
                    callback();
                    return;
                }

                self.isUserRegistered(existsUser, function (error, isRegistered) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (isRegistered) {
                        error = new Error('Duplicate login.');
                        error.errorCode = 'InvalidLogin';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    self.removeUserById(existsUser.id, callback);
                });
            }).error(callback);
        },
        function (callback) {
            if (context.config.application.unique_email) {
                // check email
                context.models.User.find({
                    where : {email : user.email}
                }).success(function (existsUser) {
                    if (!existsUser) {
                        callback();
                        return;
                    }

                    self.isUserRegistered(existsUser, function (error, isRegistered) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        if (isRegistered) {
                            error = new Error('Duplicate email.');
                            error.errorCode = 'InvalidEmail';
                            error.statusCode = 400;
                            callback(error);
                            return;
                        }

                        self.removeUserById(existsUser.id, callback);
                    });
                }).error(callback);
            } else {
                callback();
            }
        },
        function (callback) {
            user.password_salt = random.text(20, random.seedLettersAndNumbers);
            user.encrypted_password = utils.encryptPassword(user.password, user.password_salt);

            user.entry_date = new Date();
            user.entry_operator = context.user && context.user.userId;
            self.models.User.create(user).done(callback);
        },

        function (result, callback) {
            newUser = result;

            var key;
            for (key in context) {
                if (context.hasOwnProperty(key) && key !== 'daos') {
                    contextOfNewUser[key] = context[key];
                }
            }

            contextOfNewUser.user = {
                userId : newUser.id,
                login : newUser.login,
                deviceId : context.user && context.user.deviceId,
            };

            newUserDao = daos.createDao('User', contextOfNewUser);
            addressDao = daos.createDao('Address', contextOfNewUser);
            callback();
        },

        function (callback) {
            if (!user.homeAddress) {
                callback();
                return;
            }

            addressDao.createHomeAddress(user.homeAddress, function (error, newAddress) {
                if (error) {
                    callback(error);
                    return;
                }

                newUserDao.changeHomeAddressId(newUser.id, newAddress.id, function (error) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    newUser.homeAddress = newAddress;
                    callback();
                });
            });
        },

        function (callback) {
            if (!user.shippingAddress) {
                callback();
                return;
            }

            addressDao.createShippingAddress(user.shippingAddress, function (error, newAddress) {
                if (error) {
                    callback(error);
                    return;
                }

                newUserDao.changeShippingAddressId(newUser.id, newAddress.id, function (error) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    newUser.shippingAddress = newAddress;
                    callback();
                });
            });
        },

        function (callback) {
            if (!user.billingAddress) {
                callback();
                return;
            }

            addressDao.createBillingAddress(user.billingAddress, function (error, newAddress) {
                if (error) {
                    callback(error);
                    return;
                }

                newUserDao.changeBillingAddressId(newUser.id, newAddress.id, function (error) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    newUser.billingAddress = newAddress;
                    callback();
                });
            });
        },

        function (callback) {
            if (!user.websiteAddress) {
                callback();
                return;
            }

            addressDao.createWebsiteAddress(user.websiteAddress, function (error, newAddress) {
                if (error) {
                    callback(error);
                    return;
                }

                newUserDao.changeWebsiteAddressId(newUser.id, newAddress.id, function (error) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    newUser.websiteAddress = newAddress;
                    callback();
                });
            });
        },

        function (callback) {
            var statusName = user.statusName || 'Unregistered';
            self.setStatusOfUserByStatusName(newUser, statusName, callback);
        },

        function (callback) {
            self.addRoleOfUserByRoleCode(newUser, user.roleCode, callback);
        },

        function (callback) {
            var securityQuestions = user.securityQuestions;
            if (!securityQuestions || !securityQuestions.length) {
                callback();
                return;
            }

            async.forEachSeries(securityQuestions, function (securityQuestion, callback) {
                saveSecurityQuestionForUser(context, newUser, securityQuestion, callback);
            }, function (error) {
                callback(error);
            });
        }
    ], function (error) {
        if (error) {
            if (!newUser) {
                callback(error);
                return;
            }

            removeUserById(context, newUser.id, function () {
                callback(error);
                return;
            });

            return;
        }

        callback(null, newUser);
    });
};


User.prototype.createResetPasswordTokenForUser = function (user, callback) {
    var logger = this.context.logger;

    logger.trace('Creating reset password token for user %d', user.id);

    user.reset_password_token = random.text(50, random.seedLettersAndNumbers);
    user.reset_password_sent_at = new Date();
    user.save(['reset_password_token', 'reset_password_sent_at']).done(function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, {
            token : user.reset_password_token,
            createdAt : user.reset_password_sent_at
        });
    });
};


User.prototype.validateResetPasswordToken = function (token, callback) {
    var context = this.context,
        logger = context.logger;

    logger.trace('Validating reset password token...');
    async.waterfall([
        function (callback) {
            logger.trace('Getting user by reset password token...');
            context.readModels.User.find({
                where : {reset_password_token : token}
            }).done(callback);
        },

        function (user, callback) {
            if (!user) {
                callback(null, false);
                return;
            }

            var msOfThreeDays = 259200000;
            if (!user.reset_password_sent_at ||
                    ((new Date()) - user.reset_password_sent_at) > msOfThreeDays) {
                callback(null, false);
                return;
            }

            callback(null, true);
        }
    ], callback);
};


User.prototype.resetPassword = function (options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        error;

    logger.trace('Validating reset password token...');
    async.waterfall([
        function (callback) {
            logger.trace('Getting user by reset password token...');
            context.readModels.User.find({
                where : {reset_password_token : options.token}
            }).done(callback);
        },

        function (user, callback) {
            if (!user) {
                error = new Error('Invalid reset password token.');
                error.errorCode = 'InvalidResetPasswordToken';
                error.statusCode = 400;
                callback(error);
                return;
            }

            var msOfThreeDays = 259200000,
                queryOptions;

            if (!user.reset_password_sent_at ||
                    ((new Date()) - user.reset_password_sent_at) > msOfThreeDays) {
                error = new Error('Invalid reset password token.');
                error.errorCode = 'InvalidResetPasswordToken';
                error.statusCode = 400;
                callback(error);
                return;
            }

            user.encrypted_password = utils.encryptPassword(options.password, user.password_salt);
            user.reset_password_token = null;
            user.reset_password_sent_at = null;

            queryOptions = {
                useWriteDatabase : true,
                sqlStmt : "update users set encrypted_password = $1, reset_password_token = null, reset_password_sent_at = null where id = $2",
                sqlParams : [user.encrypted_password, user.id]
            };
            self.queryDatabase(queryOptions, function (error) {
                callback(error);
            });
        }
    ], callback);
};


User.prototype.changePassword = function (oldPassword, newPassword, callback) {
    var context = this.context,
        logger = context.logger,
        userId = context.user.userId,
        error;

    async.waterfall([
        function (callback) {
            context.models.User.find(userId).done(callback);
        },

        function (user, callback) {
            if (!user) {
                error = new Error("User not found.");
                error.errorCode = 'UserNotFound.';
                error.statusCode = 400;
                callback(error);
                return;
            }

            if (user.encrypted_password !== utils.encryptPassword(oldPassword, user.password_salt)) {
                error = new Error("The old password is wrong.");
                error.errorCode = 'InvalidOldPassword';
                error.statusCode = 400;
                callback(error);
                return;
            }

            user.encrypted_password = utils.encryptPassword(newPassword, user.password_salt);
            user.save(['encrypted_password']).done(function (error) {
                callback(error);
            });
        }
    ], callback);
};


User.prototype.changePasswordByAdmin = function (userId, newPassword, callback) {
    var context = this.context,
        logger = context.logger,
        error;

    async.waterfall([
        function (callback) {
            context.models.User.find(userId).done(callback);
        },

        function (user, callback) {
            if (!user) {
                error = new Error("User not found.");
                error.errorCode = 'UserNotFound.';
                error.statusCode = 400;
                callback(error);
                return;
            }

            user.encrypted_password = utils.encryptPassword(newPassword, user.password_salt);
            user.save(['encrypted_password']).done(function (error) {
                callback(error);
            });
        }
    ], callback);
};


User.prototype.getCurrentOperator = function (callback) {
    var self = this,
        context = this.context,
        userId = context.user && context.user.userId,
        user;

    if (!userId) {
        callback(null, null);
        return;
    }

    async.waterfall([
        function (callback) {
            context.readModels.User.find(userId).done(callback);
        },

        function (result, callback) {
            user = result;

            self.getRolesOfUser(user, callback);
        },

        function (roles, callback) {
            var role,
                i;

            for (i = 0; i < roles.length; i += 1) {
                role = roles[i];
                if (role.is_admin) {
                    user.isAdmin = true;
                    break;
                }
            }

            callback(null, user);
        }
    ], callback);
};

/*
 *  options = {
 *      userId : <Integer>,
 *      login : <String>,
 *      email : <String>,
 *  }
 */
User.prototype.updateProfile = function (options, callback) {
    var context = this.context,
        user,
        fieldsToUpdate = [],
        error;

    if (options.login) {
        options.login = options.login.toLowerCase();
    }

    if (options.email) {
        options.email = options.email.toLowerCase();
    }

    async.waterfall([
        function (callback) {
            context.models.User.find(options.userId).done(function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                user = result;

                if (!user) {
                    error = new Error("User not found.");
                    error.errorCode = 'UserNotFound';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            if (!options.login || user.login === options.login) {
                callback();
                return;
            }

            validateUserLogin(context, options.login, function (error, failures) {
                if (error) {
                    callback(error);
                    return;
                }

                if (failures.length) {
                    error = new Error(failures[0]);
                    error.errorCode = 'InvalidLogin';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            if (!options.login || user.login === options.login) {
                callback();
                return;
            }

            context.models.User.find({
                where : { login : options.login }
            }).done(function (error, userExists) {
                if (userExists) {
                    if (userExists.id !== user.id) {
                        error = new Error("Duplicated user login.");
                        error.errorCode = 'InvalidLogin';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }
                } else {
                    user.login = options.login;
                    fieldsToUpdate.push('login');
                }

                callback();
            });
        },

        function (callback) {
            if (!options.email || user.email === options.email) {
                callback();
                return;
            }

            if (!utils.isValidEmail(options.email)) {
                error = new Error("Invalid email.");
                error.errorCode = 'InvalidEmail';
                error.statusCode = 400;
                callback(error);
                return;
            }

            if (!context.config.application.unique_email) {
                user.email = options.email;
                fieldsToUpdate.push('email');
                callback();
                return;
            }

            // check email
            context.models.User.find({
                where : {email : options.email}
            }).success(function (existsUser) {
                if (existsUser && existsUser.id !== options.userId) {
                    error = new Error('Duplicate email.');
                    error.errorCode = 'InvalidEmail';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                user.email = options.email;
                fieldsToUpdate.push('email');
                callback();
            }).error(callback);
        },

        function (callback) {
            if (!fieldsToUpdate.length) {
                callback();
                return;
            }

            user.save(fieldsToUpdate).done(function (error) {
                callback(error);
            });
        }
    ], callback);
};


User.prototype.validateUserLogin = function (login, callback) {
    validateUserLogin(this.context, login, callback);
};


User.prototype.updateLifetimeRank = function (user, lifetimeRank, callback) {
    var context = this.context,
        logger = context.logger,
        queryDatabaseOptions = {
            useWriteDatabase : true,
            sqlStmt : "UPDATE distributors SET lifetime_rank = $1 WHERE user_id = $2",
            sqlParams : [lifetimeRank, user.id]
        };

    logger.debug("Updating lifetime rank of user %d", user.id);
    DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback();
    });
};


User.prototype.removeUserById = function (userId, callback) {
    removeUserById(this.context, userId, callback);
};

/**
 * Return a JSON object
 * { meta : {limit:Number, offset:Number, count:Number}, data:[]}
 * e.g.
 * {
 *    meta: {limit: 25, offset:0, count:50},
 *    data:[{obj}, ...]
 * }
 *
 *
 * @method getOrders
 * @param options{
 *     sponsorId:<Integer> required,
 *     level:<Integer> optional,
 *     limit:<Integer> optional,
 *     offset:<Integer> optional,
 *     lifetimeRanks:<Array> optional, // [45, 50],
 *     roleCode:<String> optional, //['R', 'D'], default: 'R'
 * }
 * @return {JSON} a json object
 */
User.prototype.listDownlineContacts = function(options, callback) {
    var context = this.context,
        self = this,
        sqlSelect = "",
        sqlSelectCount = " SELECT COUNT(*) ",
        sqlFrom = "",
        sqlWhere = " WHERE ",
        sqlOffsetLimit = "",
        sqlGroup = "",
        sqlOrder = "",
        sqlParams = [],
        sqlWhereConditions = [],
        result = {
            meta: {
                limit: options.limit,
                offset: options.offset,
                count: 0
            },
            data: []
        },
        lifetimeRankStr = '',
        error;

        options.roleCode = options.roleCode || 'D';


    if (!options.sponsorId) {
        error = new Error("Invalid SponsorId");
        error.errorCode = 'InvalidSponsorId';
        error.statusCode = 400;
        callback(error);
        return;
    }

    sqlSelect = " SELECT d.id, u.id user_id, r.role_code, d.lifetime_rank, cr.name AS lifetime_rank_name, tree.distance AS level, u.status_id, add.lastname, add.firstname, add.phone, add.city, add.address1 as address, add.zipcode, s.name state, c.name country, u.email, u.entry_date enrollment_date ";

    sqlFrom += " FROM get_row_distributor_children($1) tree ";
    sqlFrom += " INNER JOIN distributors d ON tree.child_id = d.id ";
    sqlFrom += " INNER JOIN users u ON d.user_id = u.id ";
    sqlFrom += " INNER JOIN statuses us ON us.id = u.status_id ";
    sqlFrom += " INNER JOIN roles_users ru ON ru.user_id = u.id ";
    sqlFrom += " INNER JOIN roles r ON r.id = ru.role_id ";
    sqlFrom += " INNER JOIN users_home_addresses uha ON uha.user_id = u.id and uha.is_default = true and uha.active = true ";
    sqlFrom += " INNER JOIN addresses add ON add.id = uha.address_id ";
    sqlFrom += " INNER JOIN countries c ON add.country_id = c.id ";
    sqlFrom += " LEFT JOIN states s ON add.state_id = s.id ";
    sqlFrom += " LEFT JOIN client_ranks cr ON cr.rank_identity = d.lifetime_rank ";

    sqlOrder = " ORDER BY tree.distance ASC, r.role_code ASC, add.firstname ASC, add.lastname ASC  ";

    sqlWhereConditions.push(" add.firstname IS NOT NULL AND add.firstname != '' AND add.lastname IS NOT NULL AND add.lastname != '' ");


    async.waterfall([


        //where
        function(callback) {

            sqlParams.push(options.sponsorId);

            if (options.roleCode) {
                sqlParams.push(options.roleCode);
                sqlWhereConditions.push(" r.role_code = $" + sqlParams.length);
            }

            if (options.level) {
                sqlParams.push(options.level);
                sqlWhereConditions.push(" tree.distance <= $" + sqlParams.length);
            }

            if(u.isArray(options.lifetimeRanks) && !u.isEmpty(options.lifetimeRanks)){
                lifetimeRankStr = options.lifetimeRanks.join(',');
                sqlWhereConditions.push(" d.lifetime_rank in (" + lifetimeRankStr + ")");
            }

            sqlWhere += sqlWhereConditions.join(" AND ");

            callback();
        },

        //count
        function(callback) {
            self.queryDatabase({
                cache : {
                        key : 'ListDownlineContacts_count_'+options.sponsorId+'_'+options.roleCode+'_'+options.level+'_'+lifetimeRankStr,
                        ttl : 60 * 5  // 5 minutes
                    },
                sqlStmt: sqlSelectCount + sqlFrom + sqlWhere,
                sqlParams: sqlParams
            }, function(error, res) {
                if (error) {
                    return callback(error);
                }

                result.meta.count = u.isEmpty(res.rows) ? 0 : res.rows[0].count;
                callback();
            });
        },

        //limit
        function(callback) {
            if (options.offset) {
                sqlOffsetLimit += " OFFSET " + options.offset; //TODO:
            }

            if (options.limit) {
                sqlOffsetLimit += " LIMIT " + options.limit; //TODO:
            }

            callback();
        },

        //select
        function(callback) {
            self.queryDatabase({
                cache : {
                        key : 'ListDownlineContacts_'+options.sponsorId+'_'+options.roleCode+'_'+options.level+'_'+options.offset+'_'+options.limit+'_'+lifetimeRankStr,
                        ttl : 60 * 5  // 5 minutes
                    },
                sqlStmt: sqlSelect + sqlFrom + sqlWhere + sqlGroup + sqlOrder + sqlOffsetLimit,
                sqlParams: sqlParams
            }, function(error, res) {
                if (error) {
                    return callback(error);
                }
                result.data = res.rows;
                callback(null, result);
            });
        }

    ], callback);
}

User.prototype.uniqueEmail = function(postData, callback) {
    var options,
        error;

    options = {
        cache : {
            key : "uniqueEmail" + postData.email,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'select count(*) from users where email = $1',
        sqlParams: [postData.email]
    };

    this.queryDatabase(options, function(error, result){
        if (error) {
            callback(error);
            return;
        };

        if (result.rows[0].count === 0) {
            error = new Error('Email is not Exist.');
            error.errorCode = 'NotExistEmail';
            error.statusCode = 400;
            callback(error);
            return;
        };

        if (result.rows[0].count > 1) {
            error = new Error('Email is not unique.');
            error.errorCode = 'DuplicateEmail';
            error.statusCode = 400;
            callback(error);
            return;
        }

        callback(null);
    });
};

User.prototype.updateRole = function(context, userId, newRoleId, callback) {

    var options = {
        sqlStmt: 'UPDATE roles_users SET role_id = $1 , updated_at = now() WHERE user_id = $2',
        sqlParams: [newRoleId, userId]
    };

    DAO.queryDatabase(context, options, function(error, result) {
        if (error) {
            callback(error);
            return;
        };

        callback(null, result);
    });
};


function getSponsorId (context, userId, callback) {

    var self = this;

    self.getPersonalDistributorIdByUid(context, userId, function(error, id) {
        if(!id) {
            callback(new Error('User do not have sponsorId'));
            return;
        }
        callback(null, id);
    });
}

function getAllDownLines (context, distributorId, callback) {
    var downlineIds = '',
        sqlStmt = '',
        options;

    sqlStmt += 'SELECT id FROM distributors ';
    sqlStmt += 'WHERE personal_sponsor_distributor_id = $1';
    options = {
        sqlStmt: sqlStmt,
        sqlParams: [distributorId]
    };

    DAO.queryDatabase(context, options, function(error, result) {
        if (error) {
            callback(error);
            return;
        };

        result.rows.forEach(function(res) {
            downlineIds += res.id;
            downlineIds += ',';
        });
        downlineIds = downlineIds.slice(0, -1);

        callback(null, downlineIds);
    });

}

function moveDownlineToSponsor (context, downlineIds, personalSponsorDistributorId, callback) {

    var logger = context.logger,
        sqlStmt = "",
        options;

    sqlStmt += "UPDATE distributors SET personal_sponsor_distributor_id = $1, ";
    sqlStmt += "updated_at = now() WHERE id in (";
    sqlStmt += downlineIds;
    sqlStmt += ")";
    options = {
        sqlStmt: sqlStmt,
        sqlParams: [personalSponsorDistributorId]
    };

    if(!downlineIds) {
        logger.info('No downline found, move nobody to its sponsor');
        callback(null, downlineIds);
        return;
    }

    DAO.queryDatabase(context, options, function(error, result) {
        if (error) {
            callback(error);
            return;
        };

        callback(null, downlineIds);
    });
}


function getLatestDownlinesMove (context, distributor, callback) {
    var downlinesList,
        sqlStmt = "",
        options;

    sqlStmt += "SELECT downlines FROM downline_move_tracks ";
    sqlStmt += "WHERE distributor_id = $1 AND new_downlines_sponsor_id = $2 ";
    sqlStmt += "ORDER BY created_at DESC LIMIT 1;"
    options = {
        sqlStmt: sqlStmt,
        sqlParams: [distributor.id, distributor.personal_sponsor_distributor_id]
    };

    DAO.queryDatabase(context, options, function (error, result) {
        if (error) {
            callback(error);
            return;
        };

        if (result.rows.length) {
            downlinesList = result.rows[0].downlines;
        }

        callback(null, downlinesList);
    });

}

function recordDownlineMove (context, downlineIds, distributorId,
                             newDownlinesSponsorId, notes, callback) {
    var downlineIdsStr = downlineIds,
        sqlStmt = "",
        options;

    sqlStmt += "INSERT INTO downline_move_tracks ";
    sqlStmt += "(distributor_id, downlines, new_downlines_sponsor_id, "
    sqlStmt += " notes, created_at, updated_at) ";
    sqlStmt += "VALUES($1, $2, $3, $4, now(), now());";
    options = {
        sqlStmt: sqlStmt,
        sqlParams: [distributorId, downlineIdsStr,
                    newDownlinesSponsorId, notes]
    };

    DAO.queryDatabase(context, options, function (error, result) {
        if (error) {
            callback(error);
            return;
        };

        callback();
    });
}


function moveDownlinesToDistributor(context, downlinesList, distributor, callback) {
    var sqlStmt = "",
        options;

    sqlStmt += 'UPDATE distributors SET personal_sponsor_distributor_id = $1, ';
    sqlStmt += 'updated_at = now() WHERE id IN (' + downlinesList + ')';
    options = {
        sqlStmt: sqlStmt,
        sqlParams: [distributor.id]
    };

    DAO.queryDatabase(context, options, function(error, result) {
        if (error) {
            callback(error);
            return;
        };

        callback(null, downlinesList);
    });
}

User.prototype.moveDownlines = function (context, distributor, notes, callback) {

    var personalSponsorDistributorId = distributor.personal_sponsor_distributor_id;

    async.waterfall([
        function (callback) {
            getAllDownLines(context, distributor.id, callback);
        },

        function (downlineIds, callback) {
            moveDownlineToSponsor(context, downlineIds, personalSponsorDistributorId, callback);
        },

        function (downlineIds, callback) {
            recordDownlineMove(context, downlineIds, distributor.id,
                personalSponsorDistributorId, notes, callback);
        }
    ], callback);

};

User.prototype.trackUserRoleChanges = function(context, userId, oldRoldId, newRoleId, notes, callback) {
    var sqlStmt = "",
        options;

    sqlStmt += 'INSERT INTO user_role_changes ';
    sqlStmt += '(user_id, old_role_id, new_role_id, notes, created_at, updated_at) ';
    sqlStmt += 'VALUES($1, $2, $3, $4, now(), now())';
    options = {
        sqlStmt: sqlStmt,
        sqlParams: [userId, oldRoldId, newRoleId, (notes || 'Role Change')]
    };

    DAO.queryDatabase(context, options, function(error, result) {
        if (error) {
            callback(error);
            return;
        };

        callback();
    });
};

User.prototype.getRoleByUserId = function(context, userId, callback) {

    var options = {
        sqlStmt: 'SELECT role_id FROM roles_users WHERE user_id = $1',
        sqlParams: [userId]
    };

    DAO.queryDatabase(context, options, function(error, result) {
        if (error) {
            callback(error);
            return;
        }
        callback(null, result.rows);
    });
};


User.prototype.moveDownlinesBack = function(context, distributor, notes, callback) {
    var logger = context.logger,
        sqlStmt = "",
        options;

    async.waterfall([
        function (cb) {
            getLatestDownlinesMove(context, distributor, cb);
        },

        function (downlinesList, cb) {
            moveDownlinesToDistributor(context, downlinesList.replace("[", "").replace("]", ""), distributor, cb);
        },

        function (downlinesList, cb) {
            recordDownlineMove(context, downlinesList, distributor.personal_sponsor_distributor_id, distributor.id, notes, callback);
        }

    ],function (error) {
        if(error) {
            callback(error);
            return
        }
        callback();
    });

}

User.prototype.getPersonalDistributorIdByUid = function(context, userId, callback) {
    var sqlStmt ='',
        options;

    sqlStmt += 'select personal_sponsor_distributor_id ';
    sqlStmt += 'from distributors where user_id = $1';
    options = {
        sqlStmt: sqlStmt,
        sqlParams: [userId]
    };

    DAO.queryDatabase(context, options, function(error, result) {
        if (error) {
            callback(error);
            return;
        };

        callback(null, result.rows[0].personal_sponsor_distributor_id);
    });
};


User.prototype.getAllChangedUserIds = function (context, query, callback) {
    var sqlStmt = "",
        options;

    sqlStmt += 'SELECT urc.user_id AS userId, MAX(urc.updated_at) AS changeDate ';
    sqlStmt += 'FROM user_role_changes urc ';
    sqlStmt += 'INNER JOIN roles_users ru ON ru.user_id=urc.user_id ';
    sqlStmt += 'WHERE urc.old_role_id = $1 ';
    sqlStmt += 'AND urc.new_role_id = $2 ';
    sqlStmt += 'AND ru.role_id = $2 ';
    sqlStmt += 'AND urc.updated_at >= $3 ';
    sqlStmt += 'AND urc.updated_at <= $4 ';
    sqlStmt += 'GROUP BY urc.user_id '
    sqlStmt += 'ORDER BY urc.user_id ASC ';

    options = {
        sqlStmt: sqlStmt,
        sqlParams: [query.oldRoleId, query.newRoleId,
                    query['date-from'], query['date-to']]
    };

    DAO.queryDatabase(context, options, function(error, result) {
        if (error) {
            callback(error);
            return;
        }
        callback(null, result.rows);
    });
};


User.prototype.getMovedDownlines = function (context, distributorIdStr, callback) {
    var sqlStmt = "",
        options;

    sqlStmt += 'SELECT  distributor_id, downlines, new_downlines_sponsor_id FROM downline_move_tracks ';
    sqlStmt += 'WHERE distributor_id IN (' + distributorIdStr + ')';

    options = {
        sqlStmt: sqlStmt,
        sqlParams: []
    };

    DAO.queryDatabase(context, options, function(error, result) {
        if (error) {
            callback(error);
            return;
        };
        callback(null, result.rows);
    });
};


User.prototype.getUserNames = function (context, userIdStr, callback) {
    var sqlStmt = "",
        options;

    sqlStmt += 'SELECT firstname , lastname , iso , name AS country ';
    sqlStmt += 'from addresses a, users_home_addresses ua, countries c ';
    sqlStmt += 'WHERE ua.address_id = a.id ';
    sqlStmt += 'AND a.country_id = c.id ';
    sqlStmt += 'AND ua.user_id IN (' + userIdStr + ' ) ';
    sqlStmt += 'AND ua.active = true and ua.is_default = true ';
    sqlStmt += 'ORDER BY ua.user_id';

    options = {
        sqlStmt: sqlStmt,
        sqlParams: []
    };

    DAO.queryDatabase(context, options, function(error, result) {
        if (error) {
            callback(error);
            return;
        };
        callback(null, result.rows);
    });
};


User.prototype.getChangedUserCount = function (context, query, callback) {
    var sqlStmt = "",
        options;

    sqlStmt += 'SELECT COUNT(DISTINCT urc.user_id) AS count ';
    sqlStmt += 'FROM user_role_changes urc ';
    sqlStmt += 'INNER JOIN roles_users ru ON ru.user_id=urc.user_id ';
    sqlStmt += 'WHERE urc.new_role_id = $1 ';
    sqlStmt += 'AND urc.old_role_id = $2 ';
    sqlStmt += 'AND ru.role_id = $1'
    sqlStmt += 'AND urc.updated_at >= $3 ';
    sqlStmt += 'AND urc.updated_at <= $4 ';

    options = {
        sqlStmt: sqlStmt,
        sqlParams: [query.newRoleId, query.oldRoleId, query['date-from'], query['date-to']]
    };

    DAO.queryDatabase(context, options, function(error, result) {
        if (error) {
            callback(error);
            return;
        };
        callback(null, result.rows);
    });
};

User.getFullNameByHomeAddress = function (homeAddress) {
    var firstName = '';
    var lastName = '';

    if(homeAddress) {
        firstname = homeAddress.firstname ? homeAddress.firstname : '';
        lastname = homeAddress.lastname ? homeAddress.lastname : '';
        return (firstname + ' ' + lastname).trim();
    }

    return '';
};


User.prototype.getMMDInactiveUsers = function(callback){
    var context = this.context;
    var sqlStmt ='';

    sqlStmt += ' SELECT d.id distributor_id, u.id user_id, r.role_code, u.status_id ';
    sqlStmt += ' FROM distributors d ';
    sqlStmt += ' INNER JOIN users u ON u.id = d.user_id AND u.status_id=1 ';
    sqlStmt += ' INNER JOIN roles_users ru ON ru.user_id=u.id  ';
    sqlStmt += ' INNER JOIN roles r ON ru.role_id = r.id  ';
    sqlStmt += ' WHERE  ';
    sqlStmt += " (r.role_code='R' AND  date_trunc('day', COALESCE(d.next_renewal_date,  TIMESTAMP '2015-01-01')) < date_trunc('day', now()) ) ";
    sqlStmt += ' OR ';
    sqlStmt += " (r.role_code='D' AND  ( date_trunc('day', COALESCE(d.next_renewal_date,  TIMESTAMP '2015-01-01')) < date_trunc('day', now()) OR date_trunc('day', COALESCE(d.special_distributor_next_renewal_date,  TIMESTAMP '2015-01-01')) < date_trunc('day', now()))) ";
    sqlStmt += " ORDER BY distributor_id DESC ";

    DAO.queryDatabase(context, {
        sqlStmt: sqlStmt,
        sqlParams: null
    }, function(error, result) {
        if (error) {
            callback(error);
            return;
        };
        callback(null, result.rows);
    });
}


module.exports = User;

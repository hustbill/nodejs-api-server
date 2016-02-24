/**
 * Distributor DAO class.
 */

var util = require('util');
var async = require('async');
var underscore = require('underscore');
var DAO = require('./DAO.js');
var daos = require('./index.js');
var cacheKey = require('../lib/cacheKey');
var cacheHelper = require('../lib/cacheHelper');
var utils = require('../lib/utils');

function Distributor(context) {
    DAO.call(this, context);
}

util.inherits(Distributor, DAO);

Distributor.prototype.getSponsorNameAndEmailByDistributorId = function (distributorId, callback) {
    var options;

    options = {
        cache : {
            key : cacheKey.sponsorNameAndEmailByDistributorId(distributorId),
            ttl : 60 * 60 * 24,  // 24 hours
        },
        sqlStmt: "select d.id,a.phone,u.email, a.firstname,a.lastname from distributors d, users u, users_home_addresses ua, addresses a where d.id = (select d.personal_sponsor_distributor_id from Users u, Distributors d where d.user_id = u.id and d.id = $1)  and u.id = d.user_id and ua.user_id = u.id and a.id = ua.address_id AND ua.is_default = true and ua.active = true",
        sqlParams: [distributorId]
    };

    this.queryDatabase(options, callback);
};

Distributor.prototype.getSponsor = function (distributorId, callback) {
    var options;

    options = {
        cache : {
            key : cacheKey.sponsorInfoByDistributorId(distributorId),
            ttl : 60 * 60 * 24,  // 24 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_sponsor_info($1)',
        sqlParams: [distributorId]
    };

    this.queryDatabase(options, callback);
};


Distributor.prototype.getDistributorByUserId = function (userId, callback) {
    this.models.Distributor.find({
        where : {user_id : userId}
    }).success(function (distributor) {
        callback(null, distributor);
    }).error(callback);
};


Distributor.prototype.getDistributorBySSN = function (ssn, callback) {
    var context = this.context;
    var options = {
        sqlStmt : "select * from distributors where social_security_number = $1 or taxnumber_exemption = $2",
        sqlParams : [ssn, ssn]
    };

    context.readDatabaseClient.query(
        options.sqlStmt,
        options.sqlParams,
        function (error, result) {
            if (error) {
                callback(error);
                return;
            }

            callback(null, result.rows[0]);
        }
    );
};


Distributor.prototype.getDistributorByCustomerId = function (customerId, callback) {
    this.readModels.Distributor.find({
        where : {customer_id : customerId}
    }).done(callback);
};

Distributor.prototype.updateNextRenewalDateOfDistributor = function (options, callback) {
    var distributor = options.distributor;
    var nextRenewalDate = options.nextRenewalDate;
    var specialDistributorNextRenewalDate = options.SpecialDistributorNextRenewalDate;
    var sqlStmt = "";
    var sqlparams = [];
    var hasKey = false;
    var tempJoinArray = [];

    sqlStmt += 'update distributors set ';
    if(nextRenewalDate) {
        // sqlStmt += ' next_renewal_date = $1 ';
        sqlparams.push(nextRenewalDate);
        tempJoinArray.push(' next_renewal_date = $' + sqlparams.length.toString() + " ");
        hasKey = true;
    }

    if(specialDistributorNextRenewalDate) {
        // sqlStmt += ' , next_renewal_date_monthly = $2 ';
        sqlparams.push(specialDistributorNextRenewalDate);
        tempJoinArray.push(' special_distributor_next_renewal_date = $'+ sqlparams.length.toString() + " ");
        hasKey = true;
    }

    if(hasKey === false) {
        callback(null);
        return;
    }

    sqlStmt += tempJoinArray.join(',');
    sqlStmt += ' where id = $' + (sqlparams.length + 1);
    sqlparams.push(distributor.id);

    var context = this.context;
    var queryDatabaseOptions = {
            useWriteDatabase : true,
            sqlStmt : sqlStmt,
            sqlParams : sqlparams
        };

    this.queryDatabase(queryDatabaseOptions, function (error) {
        if (error) {
            callback(error);
            return;
        }

        // clear profile cache after next_renewal_date changed
        cacheHelper.del(context, cacheKey.profile(distributor.id), function () {
            callback();
        });
    });
};

Distributor.prototype.updatePacktypeOfDistributor = function (distributor, packtypeId, callback) {
    var context = this.context,
        queryDatabaseOptions = {
            useWriteDatabase : true,
            sqlStmt : 'update distributors set packtype_id = $1 where id = $2',
            sqlParams : [packtypeId, distributor.id]
        };

    this.queryDatabase(queryDatabaseOptions, function (error) {
        if (error) {
            callback(error);
            return;
        }

        // clear profile cache after packtype_id changed
        cacheHelper.del(context, cacheKey.profile(distributor.id), function () {
            callback();
        });
    });
};

Distributor.prototype.registerDistributor = function (options, callback) {
    var self = this,
        context = this.context,
        userDao = daos.createDao('User', context),
        newUser,
        error;

    if (options.socialSecurityNumber) {
        if (!/^\d{9}$/.test(options.socialSecurityNumber)) {
            error = new Error('Social security number must be 9 digits.');
            error.errorCode = 'InvalidSocialSecurityNumber';
            error.statusCode = 400;
            callback(error);
            return;
        }
    }

    async.waterfall([
        function (callback) {
            if (!options.socialSecurityNumber) {
                callback();
                return;
            }

            self.getDistributorBySSN(options.socialSecurityNumber, function(error, distributorWithProvidedSSN) {
                if(error) {
                    callback(error);
                    return;
                }

                if (!distributorWithProvidedSSN) {
                    callback();
                    return;
                }

                userDao.isUserRegisteredById(distributorWithProvidedSSN.user_id, function (error, isRegistered) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (isRegistered) {
                        error = new Error('Social security number duplicate.');
                        error.errorCode = 'InvalidSocialSecurityNumber';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    userDao.removeUserById(distributorWithProvidedSSN.user_id, callback);
                });
            });
        },

        function (callback) {
            if (!options.sponsor) {
                callback();
                return;
            }

            self.canSponsorOthersByDistributorId(options.sponsor, function (error, canSponsorOthers) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!canSponsorOthers) {
                    error = new Error("Distributor " + options.sponsor + " can not be sponsor of others.");
                    error.errorCode = 'InvalidSponsor';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            var user = {
                    email : options.email,
                    password : options.password,
                    login : options.login,
                    homeAddress : options.homeAddress,
                    billingAddress : options.billingAddress,
                    shippingAddress : options.shippingAddress,
                    websiteAddress : options.websiteAddress,
                    roleCode : options.roleCode,
                    statusName : options.statusName
                };

            userDao.createUser(user, callback);
        },

        function (result, callback) {
            newUser = result;

            var distributor = {
                    personal_sponsor_distributor_id : options.sponsor || null,
                    user_id : newUser.id,
                    taxnumber : options.taxnumber,
                    date_of_birth : options.birthday,
                    company : options.company
                };

            if(options.company){
                distributor.taxnumber_exemption = options.socialSecurityNumber;
            }
            else {
                distributor.social_security_number = options.socialSecurityNumber;
            }
            self.models.Distributor.create(distributor).done(callback);
        }
    ], callback);
};


/*
 *  options = {
 *      login : <String> // required,
 *      password : <String> // required,
 *      email : <String> // required,
 *      shippingAddress : <Object> // required.
 *  }
 */
Distributor.prototype.registerRetailCustomer = function (options, callback) {
    var self = this,
        context = this.context,
        userDao = daos.createDao('User', context),
        newUser,
        error;

    async.waterfall([
        function (callback) {
            var user = {
                    email : options.email,
                    password : options.password,
                    login : options.login,
                    homeAddress : options.shippingAddress,
                    billingAddress : options.shippingAddress,
                    shippingAddress : options.shippingAddress,
                    roleCode : 'R', // retail customer
                    statusName : 'Active'
                };

            userDao.createUser(user, callback);
        },

        function (result, callback) {
            newUser = result;

            var distributor = {
                    personal_sponsor_distributor_id : options.sponsor || null,
                    user_id : newUser.id
                };

            self.models.Distributor.create(distributor).done(callback);
        }
    ], callback);
};

/**********************/
/* dualteam functions */
/**********************/
function getAvailableDualteamPosition(context, dualteamSponsorId, dualteamPlacement, callback) {
    var dualteamSponsor,
        dualteamChildren = {};

    async.waterfall([
        function (callback) {
            context.readModels.Distributor.find(dualteamSponsorId).done(function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                dualteamSponsor = result;
                if (!dualteamSponsor) {
                    error = new Error("Distributor " + dualteamSponsorId + " was not found.");
                    error.errorCode = 'InvalidDualteamSponsorId';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            // get dualteam children
            context.readModels.Distributor.findAll({
                where : {
                    dualteam_sponsor_distributor_id : dualteamSponsorId
                }
            }).done(function (error, distributors) {
                if (error) {
                    callback(error);
                    return;
                }

                distributors.forEach(function (distributor) {
                    if (distributor.dualteam_current_position === 'L') {
                        dualteamChildren.left = distributor;
                    } else if (distributor.dualteam_current_position === 'R') {
                        dualteamChildren.right = distributor;
                    }
                });

                if (dualteamChildren.left && dualteamChildren.right) {
                    // all position occupied.
                    callback(null, null);
                    return;
                }

                if (dualteamPlacement === 'A') {
                    if (dualteamChildren.left) {
                        callback(null, 'R');
                    } else {
                        callback(null, 'L');
                    }
                    return;
                }

                if (dualteamPlacement === 'L' && !dualteamChildren.left) {
                    callback(null, 'L');
                    return;
                }

                if (dualteamPlacement === 'R' && !dualteamChildren.right) {
                    callback(null, 'R');
                    return;
                }

                callback(null, null);
            });
        }
    ], callback);
}


function getDualteamBottomOutsideChild(context, personalSponsorDistributorId, dualteamPlacement, callback) {
    var logger = context.logger,
        options = {
            sqlStmt : "select * from get_dt_bottom_outside_child($1, $2)",
            sqlParams : [personalSponsorDistributorId, dualteamPlacement]
        };

    logger.debug('get_dt_bottom_outside_child: ' + options.sqlStmt + '  sqlParams: ' + require('util').inspect(options.sqlParams));
    context.readDatabaseClient.query(
        options.sqlStmt,
        options.sqlParams,
        function (error, result) {
            if (error) {
                callback(error);
                return;
            }
            callback(null, result.rows[0].get_dt_bottom_outside_child);
        }
    );
}

function getDualteamLeftRightInfo(context, personalSponsorDistributorId, callback) {
    var options = {
            sqlStmt : "select * from get_dt_left_right_count($1)",
            sqlParams : [personalSponsorDistributorId]
        };

    context.readDatabaseClient.query(
        options.sqlStmt,
        options.sqlParams,
        function (error, result) {
            if (error) {
                callback(error);
                return;
            }

            callback(null, result.rows[0]);
        }
    );
}

function lookupDualteamSponsorInfo(context, distributor, callback) {
    if (!distributor.personal_sponsor_distributor_id) {
        callback(null, {
            dualteamSponsorDistributorId : distributor.dualteam_sponsor_distributor_id,
            dualteamCurrentPosition : distributor.dualteam_current_position
        });
        return;
    }

    var personalSponsorDistributorId = distributor.personal_sponsor_distributor_id,
        dualteamPlacementOfPersonalSponsor,
        dualteamSponsorDistributorId,
        dualteamCurrentPosition;

    async.waterfall([
        function (callback) {
            context.readModels.Distributor.find(personalSponsorDistributorId).done(callback);
        },

        function (personalSponsor, callback) {
            dualteamPlacementOfPersonalSponsor = personalSponsor.dualteam_placement;

            if (dualteamPlacementOfPersonalSponsor === 'OL' || dualteamPlacementOfPersonalSponsor === 'IL') {
                dualteamCurrentPosition = 'L';
                getDualteamBottomOutsideChild(context, personalSponsorDistributorId, 'L', function (error, result) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    dualteamSponsorDistributorId = result || personalSponsorDistributorId;
                    callback(null, {
                        dualteamSponsorDistributorId : dualteamSponsorDistributorId,
                        dualteamCurrentPosition : dualteamCurrentPosition
                    });
                });
            } else if (dualteamPlacementOfPersonalSponsor === 'OR' || dualteamPlacementOfPersonalSponsor === 'IR') {
                dualteamCurrentPosition = 'R';
                getDualteamBottomOutsideChild(context, personalSponsorDistributorId, 'R', function (error, result) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    dualteamSponsorDistributorId = result || personalSponsorDistributorId;
                    callback(null, {
                        dualteamSponsorDistributorId : dualteamSponsorDistributorId,
                        dualteamCurrentPosition : dualteamCurrentPosition
                    });
                });
            } else {
                getDualteamLeftRightInfo(context, personalSponsorDistributorId, function (error, dualteamLeftRightInfo) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!dualteamLeftRightInfo.lcount && !dualteamLeftRightInfo.rcount) {
                        dualteamSponsorDistributorId = personalSponsorDistributorId;
                        dualteamCurrentPosition = personalSponsor.dualteam_current_position;
                        callback(null, {
                            dualteamSponsorDistributorId : dualteamSponsorDistributorId,
                            dualteamCurrentPosition : dualteamCurrentPosition
                        });

                    } else if (dualteamLeftRightInfo.lcount > dualteamLeftRightInfo.rcount) {
                        dualteamSponsorDistributorId = dualteamLeftRightInfo.rcornor || personalSponsorDistributorId;
                        dualteamCurrentPosition = 'R';
                        callback(null, {
                            dualteamSponsorDistributorId : dualteamSponsorDistributorId,
                            dualteamCurrentPosition : dualteamCurrentPosition
                        });

                    } else if (dualteamLeftRightInfo.lcount < dualteamLeftRightInfo.rcount) {
                        dualteamSponsorDistributorId = dualteamLeftRightInfo.lcornor || personalSponsorDistributorId;
                        dualteamCurrentPosition = 'L';
                        callback(null, {
                            dualteamSponsorDistributorId : dualteamSponsorDistributorId,
                            dualteamCurrentPosition : dualteamCurrentPosition
                        });

                    } else {
                        dualteamCurrentPosition = personalSponsor.dualteam_current_position;
                        getDualteamBottomOutsideChild(context, personalSponsorDistributorId, dualteamCurrentPosition, function (error, result) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            dualteamSponsorDistributorId = result || personalSponsorDistributorId;
                            callback(null, {
                                dualteamSponsorDistributorId : dualteamSponsorDistributorId,
                                dualteamCurrentPosition : dualteamCurrentPosition
                            });
                            return;
                        });
                    }
                });
            }
        }
    ], callback);
}

/*
 *  options = {
 *      dualteamSponsorId : <Integer>,
 *      dualteamPlacement : <String>
 *  }
 */
function setDistributorDualteamSponsorAndPosition(context, distributor, options, callback) {
    if (distributor.dualteam_sponsor_distributor_id &&
            distributor.dualteam_current_position &&
            distributor.dualteam_current_position !== 'A') {
        callback();
        return;
    }

    async.waterfall([
        function (next) {
            if (!options || !options.dualteamSponsorId) {
                next();
                return;
            }

            var distributorDao = daos.createDao('Distributor', context);
            distributorDao.canSponsorOthersByDistributorId(options.dualteamSponsorId, function (error, canSponsorOthers) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!canSponsorOthers) {
                    error = new Error("Distributor " + options.dualteamSponsorId + " can not be sponsor of others.");
                    error.errorCode = 'InvalidDualteamSponsorId';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                getAvailableDualteamPosition(context, options.dualteamSponsorId, options.dualteamPlacement, function (error, position) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!position) {
                        next();
                        return;
                    }

                    distributor.dualteam_sponsor_distributor_id = options.dualteamSponsorId;
                    distributor.dualteam_current_position = position;
                    callback();
                });

            });
        },

        function (callback) {
            if (!distributor.dualteam_current_position ||
                    distributor.dualteam_current_position === 'A') {
                lookupDualteamSponsorInfo(context, distributor, function (error, sponsorInfo) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    distributor.dualteam_sponsor_distributor_id = sponsorInfo.dualteamSponsorDistributorId;
                    distributor.dualteam_current_position = sponsorInfo.dualteamCurrentPosition;

                    callback();
                });
            } else if (!distributor.dualteam_sponsor_distributor_id) {
                getDualteamBottomOutsideChild(context, distributor.personal_sponsor_distributor_id, distributor.dualteam_current_position, function (error, result) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    distributor.dualteam_sponsor_distributor_id = result;
                    callback();
                });
            }
        },

        function (callback) {
            // if the dualteam sponsor id is null, set to personal sponsor id
            distributor.dualteam_sponsor_distributor_id = distributor.dualteam_sponsor_distributor_id || distributor.personal_sponsor_distributor_id;

            callback();
        }
    ], callback);
}

function saveAndEnsureDistributorIdIsLessThanDualteamSponsor(context, distributor, callback) {
    if (distributor.id > distributor.dualteam_sponsor_distributor_id) {
        distributor.save(['dualteam_sponsor_distributor_id', 'dualteam_current_position']).done(callback);
        return;
    }

    async.waterfall([
        function (callback) {
            distributor.destroy().done(callback);
        },

        function (result, callback) {
            var newDistributor = underscore.clone(distributor);
            newDistributor.id = null;

            context.models.Distributor.create(newDistributor).done(callback);
        }
    ], callback);
}

Distributor.prototype.validateDualteamSponsorPlacement = function (dualteamSponsorId, dualteamPlacement, callback) {
    getAvailableDualteamPosition(this.context, dualteamSponsorId, dualteamPlacement, function (error, availablePosition) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, !!availablePosition);
    });
};

Distributor.prototype.getDualteamBottomOutsideChild = function (personalSponsorDistributorId,
																dualteamPlacement,
																callback) {
    getDualteamBottomOutsideChild(this.context, personalSponsorDistributorId, dualteamPlacement, callback);
};

/*
 * Set dualteam settings first time after distributor registered.
 *
 *  options = {
 *      dualteamSponsorId : <Integer>,
 *      dualteamPlacement : <String>
 *  }
 */
Distributor.prototype.setDualteamSettings = function (distributor, options, callback) {
    var self = this,
        context = this.context,
        logger = context.logger;

    logger.debug("Setting dualteam settings...");
    async.waterfall([
        function (next) {
            self.canHaveDualteamPosition(distributor, function (error, canHaveDualteamPosition) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!canHaveDualteamPosition) {
                    callback(null, distributor);
                    return;
                }

                next();
            });
        },

        function (callback) {
            setDistributorDualteamSponsorAndPosition(context, distributor, options, callback);
        },

        function (callback) {
            saveAndEnsureDistributorIdIsLessThanDualteamSponsor(context, distributor, callback);
        }
    ], callback);
};


/*
 *  options = {
 *      distributorId : <Integer> required.
 *      dualteamSponsorId : <Integer> required.
 *      dualteamPlacement : <String> required. 'A' | 'L' | 'R'
 *  }
 */
Distributor.prototype.changeDualteamPosition = function (options, callback) {
    var context = this.context,
        logger = context.logger,
        distributor;

    async.waterfall([
        function (callback) {
            context.models.Distributor.find(options.distributorId).done(callback);
        },

        function (result, next) {
            distributor = result;

            if (!distributor) {
                var error = new Error("Distributor " + options.distributorId + " was not found.");
                error.errorCode = 'InvalidDistributorId';
                error.statusCode = 400;
                callback(error);
                return;
            }

            if (distributor.dualteam_sponsor_distributor_id === options.dualteamSponsorId
                    && (options.dualteamPlacement === 'A' || distributor.dualteam_current_position === options.dualteamPlacement)) {
                callback();
                return;
            }

            getAvailableDualteamPosition(context, options.dualteamSponsorId, options.dualteamPlacement, next);
        },

        function (availablePosition, callback) {
            if (!availablePosition) {
                var error = new Error("Invalid dualteam placement");
                error.errorCode = 'InvalidDualteamPlacement';
                error.statusCode = 400;
                callback(error);
                return;
            }

            distributor.dualteam_sponsor_distributor_id = options.dualteamSponsorId;
            distributor.dualteam_current_position = availablePosition;

            distributor.save(['dualteam_sponsor_distributor_id', 'dualteam_current_position']).done(function (error) {
                callback(error);
            });
        }
    ], callback);
};


function clearSponsorCache(context, distributorId, callback) {
    async.waterfall([
        function (callback) {
            cacheHelper.del(context, cacheKey.sponsorInfoByDistributorId(distributorId), callback);
        },

        function (callback) {
            cacheHelper.del(context, cacheKey.sponsorNameAndEmailByDistributorId(distributorId), callback);
        }
    ], callback);
}


/*
 *  options = {
 *      distributorId : <Integer>, required
 *      userId : <Integer>, optional
 *      dateOfBirth : <Date>, required
 *      socialSecurityNumber : <String>, required for admin
 *      taxnumber : <String>, required for admin
 *      unilevelSponsorId : <Integer> optional
 *      nextRenewalDate : <Date>, optional
 *      customerId : <String> optional
 *  }
 */
Distributor.prototype.updateProfile = function (options, callback) {
    var self = this,
        context = this.context,
        distributor,
        error;

    if (!options.distributorId && !options.userId) {
        error = new Error('Distributor id is required.');
        error.errorCode = 'InvalidDistributorId';
        error.statusCode = 400;
        callback(error);
        return;
    }
    if (options.socialSecurityNumber) {
        if (!/^\d{9}$/.test(options.socialSecurityNumber)) {
            error = new Error('Social security number must be 9 digits.');
            error.errorCode = 'InvalidSocialSecurityNumber';
            error.statusCode = 400;
            callback(error);
            return;
        }
    }

    if (!underscore.isUndefined(options.enrollmentStatus)) {
        if (options.enrollmentStatus !== -1
                && options.enrollmentStatus !== 0
                && options.enrollmentStatus !== 1
                && options.enrollmentStatus !== 2
                && options.enrollmentStatus !== 3) {
            error = new Error('Invalid enrollment status. Must be -1, 0, 1, 2 or 3.');
            error.errorCode = 'InvalidEnnrollmentStatus';
            error.statusCode = 400;
            callback(error);
            return;
        }
    }

    async.waterfall([
        function (callback) {
            if (options.distributorId) {
                context.models.Distributor.find(options.distributorId).done(callback);
            } else {
                context.models.Distributor.find({
                    where : { user_id : options.userId }
                }).done(callback);
            }
        },

        function (result, callback) {
            distributor = result;

            // validate social security number
            if (!options.socialSecurityNumber) {
                callback();
                return;
            }

            self.getDistributorBySSN(options.socialSecurityNumber, function(error, distributorWithProvidedSSN){
                if (!distributorWithProvidedSSN) {
                    callback();
                    return;
                }

                if (distributorWithProvidedSSN.id === distributor.id) {
                    callback();
                    return;
                }

                error = new Error('Social security number duplicate.');
                error.errorCode = 'InvalidSocialSecurityNumber';
                error.statusCode = 400;
                callback(error);
                return;
            });
        },

        function (callback) {
            // validate unilevel sponsor distributor id
            if (!options.unilevelSponsorId) {
                callback();
                return;
            }

            context.readModels.Distributor.find(options.unilevelSponsorId).done(function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                if (!result) {
                    error = new Error("Unilevel sponsor distributor with id " + options.unilevelSponsorId + " does not exist.");
                    error.errorCode = 'InvalidUnilevelSponsorDistributorId';
                    error.statusCode = 400;
                    callback(error);
                    return;
                }

                self.canSponsorOthersByDistributorId(options.unilevelSponsorId, function (error, canSponsorOthers) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    if (!canSponsorOthers) {
                        error = new Error("Distributor " +  options.unilevelSponsorId + " can not be sponsor of others.");
                        error.errorCode = 'InvalidSponsor';
                        error.statusCode = 400;
                        callback(error);
                        return;
                    }

                    callback();
                });
            });
        },

        function (callback) {
            // check customer id
            if (!options.customerId) {
                callback();
                return;
            }

            context.models.Distributor.find({
                where : { customer_id : options.customerId}
            }).done(function (error, distributorWithProvidedCustomerId) {
                if (!distributorWithProvidedCustomerId) {
                    callback();
                    return;
                }

                if (distributorWithProvidedCustomerId.id === distributor.id) {
                    callback();
                    return;
                }

                error = new Error('Customer id duplicate.');
                error.errorCode = 'InvalidCustomerId';
                error.statusCode = 400;
                callback(error);
                return;
            });
        },

        function (callback) {
            var fieldsToUpdate = [],
                error;

            if (!distributor) {
                error = new Error("Distributor not found.");
                error.errorCode = 'DistributorNotFound';
                error.statusCode = 400;
                callback(error);
                return;
            }

            distributor.date_of_birth = options.dateOfBirth;
            fieldsToUpdate.push('date_of_birth');

            if (!underscore.isUndefined(options.company)) {
                distributor.company = options.company;
                fieldsToUpdate.push('company');
            }

            if (!underscore.isUndefined(options.socialSecurityNumber)) {
                if(distributor.company !== null){
                    distributor.taxnumber_exemption = options.socialSecurityNumber;
                    fieldsToUpdate.push('taxnumber_exemption');
                }
                else {
                    distributor.social_security_number = options.socialSecurityNumber;
                    fieldsToUpdate.push('social_security_number');
                }
            }

            if (!underscore.isUndefined(options.taxnumber)) {
                distributor.taxnumber = options.taxnumber;
                fieldsToUpdate.push('taxnumber');
            }

            if (!underscore.isUndefined(options.unilevelSponsorId)) {
                distributor.personal_sponsor_distributor_id = options.unilevelSponsorId;
                fieldsToUpdate.push('personal_sponsor_distributor_id');
            }

            if (!underscore.isUndefined(options.enrollmentStatus)) {
                distributor.lifetime_packtype_id = options.enrollmentStatus;
                fieldsToUpdate.push('lifetime_packtype_id');
            }

            if (!underscore.isUndefined(options.customerId)) {
                distributor.customer_id = options.customerId;
                fieldsToUpdate.push('customer_id');
            }

            if (!underscore.isUndefined(options.nextRenewalDate)) {
                distributor.next_renewal_date = options.nextRenewalDate;
                fieldsToUpdate.push('next_renewal_date');
            }

            if (!underscore.isUndefined(options.nextSpecialDistributorRenewalDate)) {
                distributor.special_distributor_next_renewal_date =
                    options.nextSpecialDistributorRenewalDate;
                fieldsToUpdate.push('special_distributor_next_renewal_date');
            }

            distributor.save(fieldsToUpdate).done(function (error) {
                callback(error);
            });
        },

        function (callback) {
            if (underscore.isUndefined(options.unilevelSponsorId)) {
                callback();
                return;
            }

            clearSponsorCache(context, distributor.id, callback);
        }
    ], callback);
};


Distributor.prototype.getRoleCodeOfDistrbutor = function (options, callback) {
    var distributor_id = options.distributor_id;
    var context = this.context;
    var queryOptions = {
        sqlStmt: [' select role_code from roles ',
            ' join roles_users on roles_users.role_id = roles.id ',
            ' join distributors on distributors.user_id = roles_users.user_id ',
            ' where distributors.id = $1 '
        ].join(' '),
        sqlParams: [distributor_id]
    };

    context.readDatabaseClient.query(
        queryOptions.sqlStmt,
        queryOptions.sqlParams,
        function (error, result) {
            if (error) {
                callback(error);
                return;
            }

            var roleCode = result.rows[0] ? result.rows[0].role_code : null;
            if(roleCode === null) {
                error = new Error('can not find distributor role code.');
                error.statusCode = 500;
                error.errorCode = 'InternalError';
                callback(error);
            }
            else {
                callback(null, roleCode);
            }
        }
    );

};

/**
* warning: this method is not be used.
*/
Distributor.prototype.resetRenewalDateOfDistributor = function (options, callback) {
    var self = this;
    var distributor = options.distributor;
    var nextRenewalDate = options.nextRenewalDate;
    var context = self.context;
    var updateFieldArray = options.updateFieldArray;

    if(context.companyCode !== 'MMD') {
        distributor.next_renewal_date = nextRenewalDate;
        if(updateFieldArray){
            updateFieldArray.push('next_renewal_date');
        }
        callback(null);
        return;
    }

    //MMD company
    async.waterfall([
        function (callback) {
            self.getRoleCodeOfDistrbutor({
                distributor_id: distributor.id
            }, callback);
        },

        function (roleCode, callback) {
            if (roleCode === "D") {
                distributor.special_distributor_next_renewal_date = nextRenewalDate;
                if(updateFieldArray) {
                    updateFieldArray.push('special_distributor_next_renewal_date');
                }
            }
            else {
                distributor.next_renewal_date = nextRenewalDate;
                if(updateFieldArray) {
                    updateFieldArray.push('next_renewal_date');
                }
            }
            callback(null);
        }
    ], function (error) {
        callback(error);
        return;
    });
};

Distributor.prototype.updatePersonalSponsorDistributorIdOfDistributor = function (distributor, newPersonalSponsorDistributorId, callback) {
    var context = this.context;

    async.waterfall([
        function (callback) {
            var queryDatabaseOptions = {
                    sqlStmt : "UPDATE distributors SET personal_sponsor_distributor_id = $1 WHERE id = $2",
                    sqlParams : [newPersonalSponsorDistributorId, distributor.id]
                };
            DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
                callback(error);
            });
        },

        function (callback) {
            clearSponsorCache(context, distributor.id, callback);
        }
    ], callback);
};


Distributor.prototype.canSponsorOthers = function (distributor, callback) {
    var self = this;
    var context = this.context;
    var logger = context.logger;
    var userDao = daos.createDao('User', context);
    var user;

    if(!distributor) {
        var error = new Error('Invalid sponsor');
        error.statusCode = 400;
        error.errorCode = 'InvalidSponsor';
        callback(error);
        return;
    }

    async.waterfall([
        function (callback) {
            userDao.getById(distributor.user_id, callback);
        },

        function (result, callback) {
            user = result;
            userDao.getRolesOfUser(user, callback);
        },

        function (roles, next) {
            var rolesCanSponsorOthers = context.config.application.rolesCanSponsorOthers || [],
                role,
                i,
                isInRoles = false;

            for (i = 0; i < roles.length; i += 1) {
                role = roles[i];
                if (rolesCanSponsorOthers.indexOf(role.role_code) !== -1) {
                    isInRoles = true;
                    break;
                }
            }

            if (!isInRoles) {
                logger.trace("can not sponsor others: role not in config.application.rolesCanSponsorOthers");
                callback(null, false);
                return;
            }

            next();
        },

        function (next) {
            // check status
            userDao.isUserDisabled(user, function (error, isDisabled) {
                if (error) {
                    callback(error);
                    return;
                }

                if (isDisabled) {
                    logger.trace("can not sponsor others: user inactive");
                    callback(null, false);
                    return;
                }

                next();
            });
        },

        function (callback) {
            self.isRenewalDueByDistributor({distributor: distributor}, function (error, isRenewalDue) {
                callback(error, !isRenewalDue);
            });
        }
    ], callback);
};


Distributor.prototype.canSponsorOthersByDistributorId = function (distributorId, callback) {
    var self = this;

    async.waterfall([
        function (callback) {
            self.getById(distributorId, callback);
        },

        function (distributor, callback) {
            self.canSponsorOthers(distributor, callback);
        }
    ], callback);
};

Distributor.prototype.validateSponsorByDsitributorId = function (options, callback) {
    var self = this;
    var distributorId = options.distributorId;
    var context = self.context;

    async.waterfall([
        function (callback) {
            var distributorDao = daos.createDao('Distributor', context);
            distributorDao.canSponsorOthersByDistributorId(distributorId, callback);
        }
    ], function(error, canBeSponsor) {
        if(error) {
            callback(error);
            return;
        }

        if(canBeSponsor !== true) {
            error = new Error("Distributor " +
                personalSponsorDistributorId + " can not be sponsor of others.");
            error.statusCode = 400;
            error.errorCode = 'InvalidSponsor';
            callback(error);
            return;
        }

        callback();
    });
};

Distributor.prototype.validateSponsorByDsitributor = function (options, callback) {
    var self = this;
    var distributor = options.distributor;
    var context = self.context;

    async.waterfall([
        function (callback) {
            var distributorDao = daos.createDao('Distributor', context);
            distributorDao.canSponsorOthers(distributor, callback);
        }
    ], function(error, canBeSponsor) {
        if(error) {
            callback(error);
            return;
        }

        if(canBeSponsor !== true) {
            error = new Error("Distributor " +
                personalSponsorDistributorId + " can not be sponsor of others.");
            error.statusCode = 400;
            error.errorCode = 'InvalidSponsor';
            callback(error);
            return;
        }

        callback();
    });
};

Distributor.prototype.canHaveDualteamPosition = function (distributor, callback) {
    var context = this.context,
        userDao = daos.createDao('User', context);

    async.waterfall([
        function (callback) {
            userDao.getById(distributor.user_id, callback);
        },

        function (user, callback) {
            userDao.getRolesOfUser(user, callback);
        },

        function (roles, callback) {
            var rolesHaveDualteamPosition = context.config.application.rolesHaveDualteamPosition || [],
                role,
                i;

            for (i = 0; i < roles.length; i += 1) {
                role = roles[i];
                if (rolesHaveDualteamPosition.indexOf(role.role_code) !== -1) {
                    callback(null, true);
                    return;
                }
            }

            callback(null, false);
        }
    ], callback);
};


Distributor.prototype.canHaveDualteamPositionByDistributorId = function (distributorId, callback) {
    var self = this;

    async.waterfall([
        function (callback) {
            self.getById(distributorId, callback);
        },

        function (distributor, callback) {
            self.canHaveDualteamPosition(distributor, callback);
        }
    ], callback);
};

/**
*  validate unilevel relationship
*  options = {
*       parentDistributorId : <Integer> required
*       childDistributorId : <Integer> required
*  }
*/
Distributor.prototype.validateParentChildRelationshipUL = function(options, callback){
    var self = this;
    options.methodName = 'is_ul_parent_child';
    self.validateParentChildRelationship(options, callback);
};

/**
*  validate dualteam relationship
*  options = {
*       parentDistributorId : <Integer> required
*       childDistributorId : <Integer> required
*  }
*/
Distributor.prototype.validateParentChildRelationshipDT = function(options, callback){
    var self = this;
    options.methodName = 'is_dt_parent_child';
    self.validateParentChildRelationship(options, callback);
};

/**
*  validate relationship
*  options = {
*       methodName: <String> required, ['is_ul_parent_child', 'is_dt_parent_child']
*       parentDistributorId : <Integer> required
*       childDistributorId : <Integer> required
*  }
*/
Distributor.prototype.validateParentChildRelationship = function(options, callback){
    var self = this,
        context = self.context,
        logger = context.logger,
        methodName = options.methodName,
        parentDistributorId = options.parentDistributorId,
        childDistributorId = options.childDistributorId,
        sqlStmt,
        sqlParams,
        error;

    if(!underscore.isString(methodName)){
        error = new Error('methodName is required');
        error.statusCode = 500;
        error.errorCode = 'InternalError';
        callback(error);
        logger.warn("methodName is required");
        return;
    }

    if(!underscore.isNumber(parentDistributorId)){
        error = new Error('parentDistributorId is required');
        error.statusCode = 500;
        error.errorCode = 'InternalError';
        callback(error);
        logger.warn("parentDistributorId is required");
        return;
    }

    if(!underscore.isNumber(childDistributorId)){
        error = new Error('childDistributorId is required');
        error.statusCode = 500;
        error.errorCode = 'InternalError';
        callback(error);
        logger.warn("childDistributorId is required");
        return;
    }

    sqlStmt = 'SELECT * FROM ' + methodName + '($1, $2)';
    sqlParams = [parentDistributorId, childDistributorId];

    self.queryDatabase({
        sqlStmt:sqlStmt,
        sqlParams:sqlParams
    }, function (error, result) {
        if (error) {
            error.statusCode = 500;
            callback(error);
            return;
        }

        if(!underscore.isObject(result) || !underscore.isArray(result.rows) || underscore.isEmpty(result.rows)){
            error = new Error('relationship not found between %d and %d', parentDistributorId, childDistributorId);
            error.statusCode = 500;
            callback(error);
            return;
        }

        callback(null, result.rows[0][methodName]);

    });
};

Distributor.prototype.getPersonallySponsoredDistributors = function(distributorId, company_code, callback){
    var options,
        firstDayOfThisMonth = utils.getFirstDayOfThisMonth(new Date()),
    sql,
        context = this.context || {};

    sql = "select * from mobile.get_report_organization_UL2($1, $2, null, null, 0) where role_code='D' and child_level = 1";
    options = {
        cache : {
            key : 'Dashboard_' + company_code + '_personally_sponsored_distributors_' + distributorId + '_' + firstDayOfThisMonth,
            ttl : 60 * 15  // 15 minutes
        },
        sqlStmt: sql,
        sqlParams: [distributorId, firstDayOfThisMonth]
    };
    this.queryDatabase(
    options,
    function(error, result) {
        if (error) {
            callback(null, null);
            return;
        }
        try {
            callback(null, result.rows);
        } catch (exception) {
            console.log("Distributor::getPersonallySponsoredDistributors exception: " + util.inspect(exception));
            callback(null, null);
        }
    });
};


Distributor.prototype.disableToken = function (distributorId, callback) {
    var sql = '';

    sql += 'UPDATE mobile.oauth_tokens SET active = false WHERE distributor_id = $1';

    options = {
        sqlStmt: sql,
        sqlParams: [distributorId]
    };

    this.queryDatabase(options, function (error) {
        if (error) {
            callback(error);
            return;
        }
        callback();
    });
}


Distributor.prototype.getDistributorIdsFromUserIds = function (context, userIds, callback) {
    var sqlStmt = "",
        options;

    sqlStmt += 'SELECT id, user_id FROM distributors WHERE user_id IN ( ' + userIds + ' ) ORDER BY user_id';

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


Distributor.prototype.updateSocialSecurityNumber = function (distributor, socialSecurityNumber, callback) {
    var context = this.context,
        logger = context.logger,
        queryDatabaseOptions,
        error;

    if (!/^\d{9}$/.test(socialSecurityNumber)) {
        error = new Error('Social security number must be 9 digits.');
        error.errorCode = 'InvalidSocialSecurityNumber';
        error.statusCode = 400;
        callback(error);
        return;
    }

    var ssnFieldName = '';
    if(distributor.company) {
        ssnFieldName = 'taxnumber_exemption';
    }
    else {
        ssnFieldName = 'social_security_number';
    }
    queryDatabaseOptions = {
        useWriteDatabase : true,
        sqlStmt : 'update distributors set '+ ssnFieldName +' = $1 where id = $2',
        sqlParams : [socialSecurityNumber, distributor.id]
    };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error) {
        callback(error);
    });
};


Distributor.prototype.updateLifeTimeRank = function (distributorId, lifeTimeRank, callback) {
    var context = this.context,
        logger = context.logger,
        queryDatabaseOptions,
        error;

    // if(lifeTimeRank < 0 || lifeTimeRank > 100) {
    //     error = new Error("invalid lifetime rank.");
    //     error.statusCode = 400;
    //     callback(error);
    //     return;
    // }

    queryDatabaseOptions = {
        useWriteDatabase : true,
        sqlStmt: "update distributors set lifetime_rank = $1 where id =  $2",
        sqlParams: [lifeTimeRank, distributorId]
    };

    DAO.queryDatabase(context, queryDatabaseOptions, callback);
};

/**
 * is renwal due by dates
 * @param {Object} options
 *   options:
 *      nextRenewalDate {Number}
 *      nextRenewalDateMonthly {Number}
 *      nextRenewalDateYearly {Number}
 * @param {Object} callback
 * @return {undefined}
 */
Distributor.prototype._isRenewalDue = function (options) {
    var context = this.context;
    var nextRenewalDate = options.nextRenewalDate;
    var nextSpecialDistributorRenewalDate = options.nextSpecialDistributorRenewalDate;
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if(context.companyCode !== 'MMD') {
        if(!nextRenewalDate) {
            return true;
        }

        return nextRenewalDate < today;
    }
    else { //MMD conpany
        if(!nextRenewalDate || !nextSpecialDistributorRenewalDate) {
            return true;
        }

        return nextRenewalDate < today || nextSpecialDistributorRenewalDate < today;
    }

    //old business logic
    // var renewalDate =
    //     context.companyCode !== 'MMD' ? nextRenewalDate : nextSpecialDistributorRenewalDate;

    // if (!renewalDate) {
    //     return false;
    // }
    // else {
    //    return renewalDate < today;
    // }
};


/**
* is renewal due by distributor id
* @param {Object} options
*   options:
*      distributorId {Number}
* @param {Object} callback
* @return {undefined}
*/
Distributor.prototype.isRenewalDueByDistributorId = function (options, callback) {
    var self = this;
    var context = self.context;
    var distributorId = options.distributorId;

    // check next renewal date
    if (context.companyCode === 'BEB') {
        // BEB doesn't use next_renewal_date
        callback(null, true);
        return;
    }

    context.readModels.Distributor.find({
        where : { id : distributorId}
    }).done(function (error, distributor) {
        if(error) {
            callback(error);
            return;
        }

        self.isRenewalDueByDistributor({distributor: distributor}, callback);
    });

};

/**
* is renewal due by distributor
* @param {Object} options
*   options:
*      distributorId {Number}
* @param {Object} callback
* @return {undefined}
*/
Distributor.prototype.isRenewalDueByDistributor = function (options, callback) {
    var self = this;
    var context = self.context;
    var distributor = options.distributor;

    // check next renewal date
    if (context.companyCode === 'BEB') {
        // BEB doesn't use next_renewal_date
        callback(null, false);
        return;
    }

    if(!distributor) {
        error = new Error('distributor is not exist.');
        error.statusCode = 400;
        callback(error);
        return;
    }

    var renewalOptions = {
        nextRenewalDate: distributor.next_renewal_date,
        nextSpecialDistributorRenewalDate: distributor.special_distributor_next_renewal_date
    };
    callback(null, self._isRenewalDue(renewalOptions));

};

/**
 * get distributor
 * @param {Object} options
 *   options:
 *     distributor {Object} Distributor object
 * @return {String} SSN number or tax number
 */
Distributor.prototype.getTaxNumberOfDistributor = function (options) {
    var self = this;
    var distributor = options.distributor;

    if(self.context.companyCode !== 'MMD') {
        return distributor.social_security_number;
    }
    else {
        return utils.isNullOrEmpty(distributor.company) ?
            distributor.social_security_number : distributor.taxnumber_exemption;
    }
};

module.exports = Distributor;

// POST /v2/admin/users/:userId/roles

var async = require('async'),
    daos = require('../../../../../daos'),
    validator = require('validator').validators,
    userDao,
    roleDao,
    distributorDao;


function getPostData (request) {
    var body = request.body;

    return {
        roleCode : body['role-code'],
        isMoveDownlinesToSponsor : body['move-downlines-to-sponsor'] === false ? false : true,
        isMoveDownlinesBack : body['move-downlines-back'] === true ? true : false,
        notes : body['notes'] || ''
    };
}


function validateInputs (request, callback) {
    var postData = getPostData(request),
        userId = request.params.userId;

    if(!validator.isInt(userId)) {
        return callback(new Error('User id must be an integer'));
    }

    if(!validator.equals(postData.roleCode, 'R') &&
       !validator.equals(postData.roleCode, 'D')) {
        return callback(new Error('Role code must be R or D'));
    }

    callback();
}


function getUserById (userId, callback) {
    userDao.getById(userId, function(error, user) {
        if(error) {
            return callback(error);
        }

        if(!user) {
            return callback(new Error('User does not exists'));
        }
        callback(null, user);
    });
};


function getUserOldRole (context, userId, callback) {
    userDao.getRoleByUserId(context, userId, function(error, role) {
        if(error) {
            return callback(error);
        }

        if(!role.length) {
            return callback(new Error('User does not have a role'));
        }
        callback(null, role[0]);
    });
}


function getRoleByCode (roleCode, callback) {
    roleDao.getRoleByCode(roleCode, function (error, role) {
        if (error) {
            callback(error);
            return;
        }

        if (!role) {
            error = new Error('Invalid role code.');
            error.errorCode = 'InvalidRoleCode';
            error.statusCode = 400;
            callback(error);
            return;
        }

        callback(null, role);
    });
}


function moveDownlines (context, distributor, notes, callback) {
    userDao.moveDownlines(context, distributor, notes, function(error) {
        if (error) {
            callback(error);
            return;
        }
        callback();
    });
}


function moveDownlinesBack (context, distributor, notes, callback) {
    userDao.moveDownlinesBack(context, distributor, notes, function(error) {
        if (error) {
            callback(error);
            return;
        }
        callback();
    });
}


function setRoleChangeTrack (context, userId, oldRoleId, newRoleId, notes, callback) {
    userDao.trackUserRoleChanges(context, userId, oldRoleId, newRoleId, notes,
        function(error) {
            if(error) {
                callback(error);
                return;
            }
            callback();
        });
}


function disableAuthenticationTokens (distributorId, callback) {
    distributorDao.disableToken(distributorId, function (error) {
        if(error) {
            callback(error);
            return;
        }
        callback();
    });
}

function changeUserToRetail (input, callback) {
    
    var context = input.context,
        userId = input.userId,
        newRoleId = input.newRole.id,
        oldRoleId = input.oldRole.id,
        notes = input.notes,
        distributor = input.distributor,
        isMoveDownlinesToSponsor = input.isMoveDownlinesToSponsor;

    async.series({
        updateRoleToRetailCustomer : function (callback) {
            userDao.updateRole(context, userId, newRoleId, callback);
        },

        moveDownlines : function (callback) {
            if(!isMoveDownlinesToSponsor) {
                callback();
                return;
            }
            moveDownlines(context, distributor, notes, callback);
        },

        setRoleChangeTrack : function (callback) {
            setRoleChangeTrack(context, userId, oldRoleId, newRoleId, notes, callback);
        },

        disableTokens : function (callback) {
            disableAuthenticationTokens(distributor.id, callback);
        }

    },

    function(error) {
        if(error) {
            callback(error);
        }
        callback();
    });
}


function changeUserToDistributor(input, callback) {
    
    var context = input.context,
    userId = input.userId,
    newRoleId = input.newRole.id,
    oldRoleId = input.oldRole.id,
    notes = input.notes,
    distributor = input.distributor,
    isMoveDownlinesBack = input.isMoveDownlinesBack;

    async.series({
        updateRoleToDistributor : function (callback) {
            userDao.updateRole(context, userId, newRoleId, callback);
        },

        moveDownlinesBack : function (callback) {
            if(!isMoveDownlinesBack) {
                callback();
                return;
            }
            moveDownlinesBack(context, distributor, notes, callback);
        },

        setRoleChangeTrack : function (callback) {
            setRoleChangeTrack(context, userId, oldRoleId, newRoleId, notes, callback);
        },

        updateLifeTimeRank : function (callback){
            distributorDao.updateLifeTimeRank(distributor.id, 40, callback);
        },

        disableTokens : function (callback) {
            disableAuthenticationTokens(distributor.id, callback);
        }
    },

    function(error) {
        if (error) {
            callback(error);
            return;
        }
        callback();
    });
}

function changeUserRole(input, callback) {

    var oldRole = input.oldRole,
        newRole = input.newRole;

    if (oldRole.id === newRole.id) {
        var error = new Error("The user is already " + newRole.name);
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (newRole.role_code === 'R') {
        changeUserToRetail(input, callback);
    } else if (newRole.role_code === 'D') {
        changeUserToDistributor(input, callback);
    }

}


/**
 * Change the user role, will do the following:
 * 1. change user's role in roles_users table 
 * 2. Move all the user's direct downline to it's sponsor
 * 3. Create a record in downline_move_tracks table
 * 4. Create a record in user_role_changes table
 * 5. based on distributor_id,
 *    set "active" field to false for all its records in mobile.oauth_tokens
 *
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function post (request, response, next) {
    var context = request.context,
        userId = parseInt(request.params.userId, 10),
        postData = getPostData(request),
        roleCode = postData.roleCode,
        oldRole,
        newRole,
        user,
        distributor,
        personalSponsorDistributorId;

    roleDao = daos.createDao('Role', context);
    userDao = daos.createDao('User', context);
    distributorDao = daos.createDao('Distributor', context);

    async.series({
        validate : function (callback) {
            validateInputs(request, callback);
        },

        getUser : function (callback) {
            getUserById(userId, callback);
        },

        getNewRole : function (callback) {
            getRoleByCode(roleCode, callback);
        },

        getOldRole : function (callback) {
            getUserOldRole(context, userId, callback);
        }, 

        getDistributor : function (callback) {
            distributorDao.getDistributorByUserId(userId, callback);
        }
    },

    function (error, result) {
        if (error) {
            next(error);
            return;
        }

        oldRole = result.getOldRole;
        oldRole.id = oldRole.role_id;
        newRole = result.getNewRole;
        distributor = result.getDistributor.selectedValues;
        user = result.getUser;

        var input = {
            "context" : context,
            "userId" : user.id,
            "distributor" : distributor,
            "oldRole" : oldRole,
            "newRole" : newRole,
            "notes" : postData.notes,
            "isMoveDownlinesToSponsor" : postData.isMoveDownlinesToSponsor,
            "isMoveDownlinesBack" : postData.isMoveDownlinesBack
        };

        changeUserRole(input, function(error) {
            if(error) {
                next(error);
            }
            next({statusCode : 200});
        });

    });

}

module.exports = post;
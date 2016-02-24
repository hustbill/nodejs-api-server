'use strict';

var util = require('util');
var async = require('async');
var u = require('underscore');
var DAO = require('./DAO.js');
var daos = require('./index.js');

var DEFAULT_DEPTH = 4;


function ForcedMatrix(context) {
    DAO.call(this, context);
}

util.inherits(ForcedMatrix, DAO);

module.exports = ForcedMatrix;

function updateDistributorToForcedMatrix(options, callback){
    var context = options.context;
    var level = options.level;
    var position = options.position;
    var distributorId = options.distributorId;
    var sqlStmt = '';

    sqlStmt += ' UPDATE medicus_distributor_level_position SET distributor_id = $1 ';
    sqlStmt += ' WHERE level=$2 AND position=$3 ';

    DAO.queryDatabase(context, {
        sqlStmt: sqlStmt,
        sqlParams: [distributorId, level, position]
    }, function(error, result){
        if(error){
            callback(error);
            return;
        }

        callback(null, result);
    });
}

function trackForcedMatrixChanges(options, callback){
    var context = options.context;
    var oldLevel = options.oldLevel;
    var oldPosition = options.oldPosition;
    var newLevel = options.newLevel;
    var newPosition = options.newPosition;
    var distributorId = options.distributorId;
    var notes = options.notes || '';
    var sqlStmt = '';

  sqlStmt += ' INSERT INTO forced_matrix_changes (distributor_id, old_level, old_position, new_level, new_position, notes, created_at, updated_at) ';
  sqlStmt += ' VALUES ($1, $2, $3, $4, $5, $6, now(), now())';

  DAO.queryDatabase(context, {
        sqlStmt: sqlStmt,
        sqlParams: [distributorId, oldLevel, oldPosition, newLevel, newPosition, notes]
    }, function(error, result){
        if(error){
            callback(error);
            return;
        }

        callback(null, result);
    });

}

function getLevelAndPositionFromDistributorId (options, callback){
    var context = options.context;
    var distributorId = options.distributorId;
    context.models.ForcedMatrix.find({
            where : {
                distributor_id : distributorId
            }
        }).success(function (data) {
            callback(null, data);
        }).error(callback);
}

function getByLevelPositions(options, callback){
    var context = options.context;
    var tree = options.tree;
    var sqlStmt = '';

    if(!u.isArray(tree) || tree.length === 0){
        callback(null, []);
        return;
    }

    sqlStmt += ' SELECT * FROM medicus_distributor_level_position ';
    sqlStmt +=' WHERE ';

    sqlStmt += u.map(tree, function(item){ return ' level=' + item.level + ' AND ' + ' position=' + item.position; }).join(' OR ');

    DAO.queryDatabase(context, {
        sqlStmt: sqlStmt
    }, function(error, result){
        if(error){
            callback(error);
            return;
        }

        callback(null, result.rows);
    });
}

function getByLevelPositionsWithUserInfo(options, callback){
    var context = options.context;
    var tree = options.tree;
    var sponsorId = options.sponsorId;
    var sqlStmt = '';

    sqlStmt += ' SELECT tree.id, tree.distributor_id, tree.level, tree.position, u.login, add.firstname, add.lastname, r.role_code, d.personal_sponsor_distributor_id AS sponsor_id, a.id AS image_id, a.attachment_file_name AS image_name, CASE WHEN d.personal_sponsor_distributor_id = ' + sponsorId + ' THEN true ELSE false END AS is_downline ';
    sqlStmt += ", CASE WHEN r.role_code = 'D' THEN date_trunc('day', COALESCE(d.special_distributor_next_renewal_date,  TIMESTAMP '2015-01-01')) >= date_trunc('day', now()) ELSE true END AND date_trunc('day', COALESCE(d.next_renewal_date,  TIMESTAMP '2015-01-01')) >= date_trunc('day', now()) AS active ";
    sqlStmt +=' FROM medicus_distributor_level_position tree ';
    sqlStmt += ' LEFT JOIN distributors d ON d.id = tree.distributor_id ';
    sqlStmt +=' LEFT JOIN users u ON u.id = d.user_id AND u.status_id = 1 ';
    sqlStmt += ' LEFT JOIN users_home_addresses uha ON uha.user_id = u.id AND uha.is_default = true AND uha.active = true  ';
    sqlStmt += ' LEFT JOIN addresses add ON add.id = uha.address_id  ';
    sqlStmt += ' LEFT JOIN roles_users ru ON ru.user_id=u.id  ';
    sqlStmt += ' LEFT JOIN roles r ON ru.role_id = r.id  ';
    sqlStmt += ' LEFT JOIN assets a ON a.viewable_id = u.id AND a.viewable_type = \'User\' AND a.type=\'Avatar\' ';


    sqlStmt += ' WHERE '+ u.map(tree, function(item){ return ' tree.level=' + item.level + ' AND ' + ' tree.position=' + item.position; }).join(' OR ');

    DAO.queryDatabase(context, {
        sqlStmt: sqlStmt
    }, function(error, result){
        if(error){
            callback(error);
            return;
        }

        callback(null, result.rows);
    });

}

function initDownlineLevelAndPosition(level, position, depth){
     var data =[];

    for (var j = (1 << depth) -1; j >=0 ; j--) {
        data.push({
            level: level + depth,
            position: (position << depth) - j
        });
    };

    return data;
}

function initTreeByLevelAndPosition(level, position, depth){
     var data =[];
   
    for (var i = 0; i < depth; i++) {
        data = u.union(data, initDownlineLevelAndPosition(level, position, i));
    };

    return data;
}

function findPositionBySponsor(options, callback){
    var context = options.context;
    var level = options.level;
    var position = options.position;
    var depth = options.depth;
    var childPL = initDownlineLevelAndPosition(level, position, depth);
    var result;

    getByLevelPositions({
        context:context,
        tree: childPL
    }, function(error, data){
        for (var i = 0; i < childPL.length; i++) {
            var item = childPL[i];
            var foundItem = u.findWhere(data, item);
            if(foundItem){
                if(!foundItem.distributor_id){
                    result = foundItem;
                    break;
                }

            }else{
                result = item;
                break;
            }
            
        }

        if(result){
            callback(null, result);
        }else{
            options.depth += 1;
            findPositionBySponsor(options, callback);
        }
    });

}

function isDownline(options){
    var pLevel = options.pLevel;
    var pPosition = options.pPosition;
    var cLevel = options.cLevel;
    var cPosition = options.cPosition;

    var depth  = cLevel - pLevel;

    if(depth <= 0){
        return false;
    }

    var maxP = pPosition << depth;
    var minP = maxP - (1 << depth) + 1;

    if(cPosition > maxP || cPosition < minP){
        return false;
    }

    return true;

}

/**
 * validate level and position
 * @param  {object}   options  [description]
 *    options:
 *        level: integer, required
 *        position: integer, required
 *        sponsorId: integer, required
 * @param  {Function} callback [description]
 * @return {[boolean]}            [description]
 */
ForcedMatrix.prototype.canAddByLevelAndPosition = function(options, callback){
    var context = this.context;
    var level = options.level;
    var position = options.position;
    var sponsorId = options.sponsorId;

    async.waterfall([
        async.apply(getLevelAndPositionFromDistributorId, {context:context, distributorId:sponsorId}),
        function(pLevelAndPosition, callback){
            if(!pLevelAndPosition){
                error = new Error('the genealogy is not found by distributor id:' + sponsorId);
                error.statusCode = 404;
                callback(error);
                return;
            }
            callback(null, isDownline({
                pLevel: pLevelAndPosition.level,
                pPosition: pLevelAndPosition.position,
                cLevel: level,
                cPosition: position
            }));

        },
        function(isDownline, callback){
            if(!isDownline){
                callback(null, false);
                return;
            }
            getByLevelPositions({
                context:context,
                tree:[{level:level, position: position}]
            }, function(error, items){
                if(error){
                    callback(error);
                    return;
                }
                if(u.isArray(items) && items.length > 0){
                    var item = items[0];
                    if(item.distributor_id){
                        callback(null, false);
                        return;
                    }
                }
                callback(null, true);

            });

        }

    ], callback);

    
};

/**
 * get forced matrix by level and position
 * @param  {object}   options  [description]
 *    options:
 *        level: integer, required
 *        position: integer, required
 *        sponsorId:
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
ForcedMatrix.prototype.getTreeByLevelAndPosition = function(options, callback){
    var context = this.context;
    var logger = context.logger;
    var sponsorId = options.sponsorId;
    var level = options.level;
    var position = options.position;
    var tree = initTreeByLevelAndPosition(level, position, DEFAULT_DEPTH);
    var error;

    async.waterfall([
        async.apply(getLevelAndPositionFromDistributorId, {context:context, distributorId:sponsorId}),

        //downline validation
        function(pLevelAndPosition, callback){
            if(!pLevelAndPosition){
                error = new Error('the genealogy is not found by distributor id:' + sponsorId);
                error.statusCode = 404;
                callback(error);
                return;
            }

            if(pLevelAndPosition.level === level && pLevelAndPosition.position === position){
                callback();
                return;
            }

            if(isDownline({
                pLevel: pLevelAndPosition.level,
                pPosition: pLevelAndPosition.position,
                cLevel: level,
                cPosition: position
            })){
                callback();
                return;
            }

            error = new Error('Not allow.');
            error.errorCode = 'NotAllow';
            error.statusCode = 403;
            callback(error);

        },
        async.apply(getByLevelPositionsWithUserInfo, {context: context, tree: tree, sponsorId: sponsorId}),
        function(result, callback){
        
            tree.forEach(function(item){
                var tmp = u.findWhere(result, item);

                item.distributorId = null;
                item.login = null;
                item.firstname = null;
                item.lastname = null;
                item.roleCode = null;
                item.sponsorId = null;
                item.isDownline = false;
                item.active = false;
                
                if(tmp){
                    item.distributorId = tmp.distributor_id;
                    item.login = tmp.login;
                    item.firstname = tmp.firstname;
                    item.lastname = tmp.lastname;
                    item.roleCode = tmp.role_code;
                    item.sponsorId = tmp.sponsor_id;
                    item.imageId = tmp.image_id;
                    item.imageName = tmp.image_name;
                    item.isDownline = tmp.is_downline;
                    item.active = tmp.active;
                }
            });

            callback(null, tree);
        }
    ], callback);
};

/**
 * get forced matrix tree by distributor id
 * @param  {object}   options  [description]
 *    options
 *        distributorId:
 *        sponsorId:
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
ForcedMatrix.prototype.getTreeByDistributorId = function(options, callback){
    var self = this;
    var context = this.context;
    var logger = context.logger;
    var sponsorId = options.sponsorId;
    var distributorId = options.distributorId;
    var error;

    async.waterfall([
        async.apply(getLevelAndPositionFromDistributorId, {context:context, distributorId:distributorId}),
        function(levelAndPosition, callback){
            if(!levelAndPosition){
                error = new Error('the genealogy is not found by distributor id:' + distributorId);
                error.statusCode = 404;
                callback(error);
                return;
            }
            self.getTreeByLevelAndPosition({
                sponsorId: sponsorId,
                level: levelAndPosition.level,
                position: levelAndPosition.position

            }, callback);

        }
    ], callback);

};
/**
 * get forced matrix tree by distributor id
 * @param  {object}   options  [description]
 *    options
 *        login: string
 *        sponsorId:
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
ForcedMatrix.prototype.getTreeByLogin = function(options, callback){
    var self = this;
    var context = this.context;
    var logger = context.logger;
    var sponsorId = options.sponsorId;
    var login = options.login;
    var error;

    var userDAO = daos.createDao('User', context);
    var distributorDAO = daos.createDao('Distributor', context);

    async.waterfall([
        function(callback){
            userDAO.getUserByLogin(login,callback);
        },
        function(user, callback){
            if(!user){
                error = new Error('the user is not found by :' + login);
                error.statusCode = 404;
                callback(error);
                return;
            }

            distributorDAO.getDistributorByUserId(user.id, callback);

        },
        function(distributor, callback){
            if(!distributor){
                logger.info('the distributor is not found by :'+login);
                error = new Error('the user is not found by :' + login);
                error.statusCode = 404;
                callback(error);
                return;
            }

             self.getTreeByDistributorId({
                sponsorId: sponsorId,
                distributorId: distributor.id
            }, callback);

        }
    ], callback);

};

function saveOrUpdate(options, callback){
    var context = options.context;
    var forcedMatrix = options.forcedMatrix;

    if(forcedMatrix.id){
        updateDistributorToForcedMatrix({
            level:forcedMatrix.level,
            position: forcedMatrix.position,
            distributorId: forcedMatrix.distributorId,
            context:context
        }, callback);
    }else{
        context.models.ForcedMatrix.create({
            level:forcedMatrix.level,
            position: forcedMatrix.position,
            distributor_id: forcedMatrix.distributorId
        }).success(function (data) {
            callback(null, data);
        }).error(callback);
    }
}


/**
 * find and setting forced matrix tree
 * @param  {object}   options  [description]
 *    options
 *        sponsorId:  required
 *        distributorId: required
 *        forcedMatrix: {level:, position:} optional
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
ForcedMatrix.prototype.findAndSettingTree = function(options, callback){
    var self = this;
    var context = this.context;
    var logger = context.logger;
    var error;

    var forcedMatrix = options.forcedMatrix;
    var sponsorId = options.sponsorId;
    var distributorId = options.distributorId;
    var depth = 1; //TODO, catch the depth


    if(!sponsorId ){
        logger.error('sponsorId is required');
        error = new Error('sponsorId is required');
        error.statusCode=400;
        callback(error);
        return;
    }

    if(!distributorId){
        logger.error('distributorId is required');
        error = new Error('distributorId is required');
        error.statusCode=400;
        callback(error);
        return;
    }

    

        
    async.waterfall([

        function(callback){

            if(!forcedMatrix || !u.isFinite(forcedMatrix.level)  || !u.isFinite(forcedMatrix.position) ){
                callback(null, null);
                return;
            }
          
            getByLevelPositions({
                context:context,
                tree:[{level:forcedMatrix.level, position: forcedMatrix.position}]
            }, function(error, items){
                if(u.isArray(items) && items.length > 0){
                    var item = items[0];
                    if(item.distributor_id){
                        callback(null, null);
                        return;
                    }else{
                        callback(null, item);
                        return;
                    }
                }
                callback(null, {level: forcedMatrix.level, position: forcedMatrix.position});
            });
        },
        function(levelAndPosition, callback){
            if(levelAndPosition){
                callback(null, levelAndPosition);
                return;
            }

            async.waterfall([
                async.apply(getLevelAndPositionFromDistributorId, {context:context, distributorId:sponsorId}),
                function(levelAndPosition, callback){
                    if(!levelAndPosition){
                        error = new Error('the genealogy is not found by distributor id:' + distributorId);
                        error.statusCode = 404;
                        callback(error);
                        return;
                    }
                    findPositionBySponsor({
                        context: context,
                        level: levelAndPosition.level,
                        position: levelAndPosition.position,
                        depth: depth
                    }, callback);

                }
            ], callback);

        },
        function(levelAndPosition, callback){

            levelAndPosition.distributorId = distributorId;

            saveOrUpdate({context: context, forcedMatrix: levelAndPosition}, callback);
            
        }
        
    ], callback);
    
};

ForcedMatrix.prototype.getLevelAndPositionByDistributorId = function(distributorId, callback){
    var context = this.context;
    getLevelAndPositionFromDistributorId({
        context: context,
        distributorId: distributorId
    }, callback);
};

ForcedMatrix.prototype.getTopPosition = function(callback){
    var context = this.context;
    var sqlStmt = '';

    sqlStmt += ' SELECT * FROM medicus_distributor_level_position ';
    sqlStmt +=' ORDER BY level, position LIMIT 1 ';

    DAO.queryDatabase(context, {
        sqlStmt: sqlStmt
    }, function(error, result){
        if(error){
            callback(error);
            return;
        }

        if(u.isArray(result.rows) && result.rows.length > 0){
            callback(null, result.rows[0]);
            return;
        }

        callback(null, null);
    });
};

function findTreePath(options){
    var pLevel = options.pLevel;
    var pPosition = options.pPosition;
    var cLevel = options.cLevel;
    var cPosition = options.cPosition;
    var pathArr = [
        {level: pLevel, position: pPosition},
        {level: cLevel, position: cPosition}
    ];

    var tmp = cPosition;
    for (var i = cLevel-1; i > pLevel; i--) {
      
        tmp = ( tmp % 2 === 0 ) ? tmp/2 : (tmp + 1)/2
        pathArr.push({
            level: i,
            position: tmp
        });
    }

    return u.sortBy(pathArr, 'level');

}

/**
 * get forced matrix path by level and position
 * @param  {object}   options  [description]
 *    options:
 *        level: integer, required
 *        position: integer, required
 *        sponsorId:
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
ForcedMatrix.prototype.getTreePathByLevelAndPosition = function(options, callback){
    var context = this.context;
    var logger = context.logger;
    var sponsorId = options.sponsorId;
    var level = options.level;
    var position = options.position;
    var treePath = [];
    var error;

    async.waterfall([
        async.apply(getLevelAndPositionFromDistributorId, {context:context, distributorId:sponsorId}),

        //downline validation
        function(pLevelAndPosition, callback){
            if(!pLevelAndPosition){
                error = new Error('the genealogy is not found by distributor id:' + sponsorId);
                error.statusCode = 404;
                callback(error);
                return;
            }

            if(pLevelAndPosition.level === level && pLevelAndPosition.position === position){
                callback([{level: level, position: position, distributorId: sponsorId}]);
                return;
            }

            var tOptions = {
                pLevel: pLevelAndPosition.level,
                pPosition: pLevelAndPosition.position,
                cLevel: level,
                cPosition: position
            };
            if(isDownline(tOptions)){
                treePath = findTreePath(tOptions);
                callback();
                return;
            }

            error = new Error('Not allow.');
            error.errorCode = 'NotAllow';
            error.statusCode = 403;
            callback(error);

        },
        function(callback){
            getByLevelPositions({context: context, tree: treePath}, callback);
        },
        function(result, callback){
        
            treePath.forEach(function(item){
                var tmp = u.findWhere(result, item);

                item.distributorId = tmp ? tmp.distributor_id : null;
                
            });

            callback(null, treePath);
        }
    ], function(error, result){
        if(error){
            if(error instanceof Error){
                callback(error);
                return;
            }
            //
            callback(null, error);
            return;
        }
        callback(null, result);

    });
};

/**
 * get forced matrix tree by distributor id
 * @param  {object}   options  [description]
 *    options
 *        distributorId:
 *        sponsorId:
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
ForcedMatrix.prototype.getTreePathByDistributorId = function(options, callback){
    var self = this;
    var context = this.context;
    var logger = context.logger;
    var sponsorId = options.sponsorId;
    var distributorId = options.distributorId;
    var error;

    async.waterfall([
        async.apply(getLevelAndPositionFromDistributorId, {context:context, distributorId: distributorId}),
        function(levelAndPosition, callback){
            if(!levelAndPosition){
                error = new Error('the position is not found by distributor id:' + distributorId);
                error.statusCode = 404;
                callback(error);
                return;
            }
            self.getTreePathByLevelAndPosition({
                sponsorId: sponsorId,
                level: levelAndPosition.level,
                position: levelAndPosition.position

            }, callback);

        }
    ], callback);

};

ForcedMatrix.prototype.removePosition = function(options, callback){
    var self = this;
    var context =  this.context;
    var distributorId = options.distributorId;
    var notes = options.notes;

    var levelAndPosition;
    var error;

    async.waterfall([
        async.apply(getLevelAndPositionFromDistributorId, {context:context, distributorId: distributorId}),
        function(data, callback){
            levelAndPosition = data;
            if(!levelAndPosition){
                error = new Error('the position is not found by distributor id:' + distributorId);
                error.statusCode = 404;
                callback(error);
                return;
            }
            updateDistributorToForcedMatrix({
                level:levelAndPosition.level,
                position: levelAndPosition.position,
                distributorId: null,
                context:context
            }, callback);


        },
        function(result, callback){
            if(result && result.rowCount > 0){
                trackForcedMatrixChanges({
                    context: context,
                    distributorId: distributorId,
                    oldLevel: levelAndPosition.level,
                    oldPosition: levelAndPosition.position,
                    newLevel: null,
                    newPosition: null,
                    notes: notes
                }, callback);
                return;
            }

            callback();
            return;

        }
    ], callback);

};

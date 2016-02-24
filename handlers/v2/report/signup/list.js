// GET /v2/reports/signups

var async = require('async');
var daos = require('../../../../daos');

function mapSignups(distributors) {
    if (!distributors) {
        return [];
    }

    return distributors.map(function (distributor) {
        return {
            id : distributor.id,
            'entry-date' : distributor.entry_date,
            'first-name' : distributor.firstname,
            'last-name' : distributor.lastname,
            'role-name' : distributor.roleName,
            'status' : distributor.status
        };
    });
}

/**
 *
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context,
        registrationDao = daos.createDao('Registration', context),
        distributorId = context.user.distributorId,
        query = request.query,
        offset = parseInt(query.offset, 10) || 0,
        limit = parseInt(query.limit, 10) || 25,
        sortBy = query.sortby,
        result = {
            'meta-data' : {
                offset : offset,
                limit : limit
            }
        };

    distributorId = 100101;

    async.waterfall([
        function (callback) {
            var getUnilevelChildrenOptions = {
                    distributorId : distributorId,
                    sortBy : sortBy,
                    offset : offset,
                    limit : limit
                };
            registrationDao.getUnilevelChildren(getUnilevelChildrenOptions, function (error, distributors) {
                if (error) {
                    callback(error);
                    return;
                }

                result.signups = mapSignups(distributors);
                callback();
            });
        },

        function (callback) {
            var countUnilevelChildrenOptions = {
                    distributorId : distributorId
                };
            registrationDao.countUnilevelChildren(countUnilevelChildrenOptions, function (error, count) {
                if (error) {
                    callback(error);
                    return;
                }

                result['meta-data'].count = count;
                callback();
            });
        }
    ], function (error) {
        if (error) {
            next(error);
            return;
        }

        next({
            statusCode : 200,
            body : result
        });
    });
}

module.exports = list;

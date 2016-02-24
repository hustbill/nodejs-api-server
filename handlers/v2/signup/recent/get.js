// GET /v2/signups/recent


var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');

var STATUS_MAP = {
    1 : 'Cancelled',
    2 : 'Distributor',
    3 : 'Employee',
    4 : 'Inactive',
    5 : 'Preferred Customer',
    6 : 'Retail Customer',
    7 : 'Suspended',
    8 : 'Terminated',
    9 : 'Unregistered',
    10 : 'admin',
    11 : 'Customer Services Representative',
    12 : 'Customer Services Manager',
    13 : 'Warehouse',
    14 : 'Sales',
    15 : 'Management',
    16 : 'Accounting'
};

/**
 * Validate the request.
 *
 * @method validateRequest
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function validateRequest(request, callback) {
    var error,
        context = request.context,
        query = request.query,
        limit = query.limit,
        offset = query.offset;

    context.input = {};
    if (limit !== undefined) {
        if (isNaN(parseInt(limit, 10))) {
            error = new Error('Invalid limit');
            error.statusCode = 400;
            callback(error);
            return;
        }
        context.input.limit = limit;
    } else {
        context.input.limit = 10;
    }

    if (offset !== undefined) {
        if (isNaN(parseInt(offset, 10))) {
            error = new Error('Invalid offset');
            error.statusCode = 400;
            callback(error);
            return;
        }
        context.input.offset = offset;
    } else {
        context.input.offset = 0;
    }

    callback(null);
}

/**
 * Load the recent sign-ups for the given distributor.
 *
 * @method loadRecentSignups
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function loadRecentSignups(request, callback) {
    var context = request.context,
        registrationDao = daos.createDao('Registration', context),
        distributorId = context.user.distributorId;

    registrationDao.getRecentSignups(
        distributorId,
        context.input.offset,
        context.input.limit,
        function (error, result) {
            if (error) {
                callback(error);
                return;
            }
            context.result = result;
            callback(null);
        }
    );
}

/**
 * convert the database result rows into response result object.
 *
 * @method loadRecentSignups
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function generateResponse(request, callback) {
    var context = request.context,
        result = { statusCode : 200, body : []};

    context.result.rows.forEach(function (row) {
        if ((row.status !== null) && (row.entry_date !== null)) {
            result.body.push({
                'entry-date' : (row.entry_date).toYMD(),
                id : row.id,
                name : row.name,
                status : STATUS_MAP[row.status[0]]
            });
        }
    });

    callback(result);
}

/**
 * Return the recent sign-up for the distributor
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    async.series([
        function (callback) {
            validateRequest(request, callback);
        },
        function (callback) {
            loadRecentSignups(request, callback);
        },
        function (callback) {
            generateResponse(request, callback);
        }
    ], next);
}

module.exports = get;

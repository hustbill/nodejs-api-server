var crypto = require('crypto');
var du = require('date-utils');
var async = require('async');
var Validator = require('validator');
var util = require('util');
var rankMap = require('./constants').rankMap;
var rankMap_V1 = require('./constants').rankMap_V1;
var u = require('underscore');

// Constants
var DEFAULT_IMAGE_URL = '/images/nopic_mini.jpg';
var IMAGE_URL_PREFIX = '/upload/avatar/';

function generateUserAvatarUrl(id, attachmentFilename, websiteUrl) {
    websiteUrl = websiteUrl || '';

    if (id && attachmentFilename) {
        return websiteUrl + IMAGE_URL_PREFIX + id + '/small_' + attachmentFilename;
    }
    return websiteUrl + DEFAULT_IMAGE_URL;
}


/**
 * Generate the md5sum of the given content. If content is not string,
 * content.toString will be used first to convert the content to string form.
 *
 * @method md5sum
 * @param content {String|Object} The content to be digested.
 * @return {String} the base64 encoded md5 digest of the content
 */
function md5sum(content) {
    var hash = crypto.createHash('md5'),
        data;

    data = typeof content === 'string' ? content : content.toString();

    hash.update(data, 'utf-8');

    return hash.digest('base64');
}

function isValidDate(dateString) {
    var date,
        day,
        month,
        year;

    if (isNaN(Date.parse(dateString)) === false) {
        return true;
    }

    if (!/^(\d){8}$/.test(dateString)) {
        return false;
    }
    year = dateString.substr(0, 4);
    month = dateString.substr(4, 2) - 1;
    day = dateString.substr(6, 2);
    date = new Date(year, month, day);

    return (date.getFullYear() === parseInt(year, 10) && date.getMonth() === parseInt(month, 10) && date.getDate() === parseInt(day, 10));
}

function isValidEmail(emailString) {
    return emailString.match(/^(?:[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+\.)*[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+@(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!\.)){0,61}[a-zA-Z0-9]?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!$)){0,61}[a-zA-Z0-9]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\]))$/);
}

function isValidPassword(password) {
    if (password.length < 6) {
        return false;
    }

    if (/[a-zA-Z]/.test(password) && /[0-9]/.test(password)) {
        return true;
    }

    return false;
}

function encryptPassword(input_password, password_salt) {
    var i,
        input_encrypted_password = input_password + password_salt;
    for (i = 0; i < 20; i += 1) {
        input_encrypted_password = crypto.createHash('sha512').update(input_encrypted_password).digest('hex');
    }
    return input_encrypted_password;
}

function checkPassword(input_password, password_salt, encrypted_password) {
    return (encryptPassword(input_password, password_salt) === encrypted_password);
}

// return date in YYYYMMDD format
function getFirstDayOfMonth() {
    var currentDate = new Date(),
        month = currentDate.getMonth() + 1,
        formattedMonth;

    formattedMonth = (month >= 10) ? month.toString() : ('0' + month);
    return (currentDate.getFullYear() + formattedMonth + '01');
}

// return next month date in YYYY-MM-DD format
function getfirstDayOfNextMonthLine(){
    var now = new Date(),
        yyyy,
        mm
    if (now.getMonth() == 11) {
        var currentDate = new Date(now.getFullYear() + 1, 0, 1);
    } else {
        var currentDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    yyyy = currentDate.getFullYear();
    mm = (currentDate.getMonth() + 1).toString();
    return yyyy + "-" + (mm[1]? mm : "0"+mm[0]) + "-01";


}

// return date in YYYYMMDD format
function getFirstDayOfLastMonth() {
    var currentDate = new Date(),
		year = currentDate.getFullYear(),
        month = currentDate.getMonth() + 1,
        formattedMonth;

    formattedMonth = (month >= 10) ? month.toString() : ('0' + month);
	if (month === 1) {
		formattedMonth = 12;
		year -= 1;
	} else {
		month -= 1;
		formattedMonth = (month >= 10) ? month.toString() : ('0' + month);
	}
    return (year.toString() + formattedMonth + '01');
}

function getCurrentYYYYMMDD() {
    var currentDate = new Date(),
		year = currentDate.getFullYear(),
        month = currentDate.getMonth() + 1,
		d = currentDate.getDate(),
		formattedDate,
        formattedMonth;

	formattedMonth = (month >= 10) ? month.toString() : ('0' + month);
	formattedDate = (d >= 10) ? d.toString() : ('0' + d);

	return (year.toString() + formattedMonth + formattedDate);
}

// http://en.wikipedia.org/wiki/Hash-based_message_authentication_code
function getHamcContent(key, data) {
    var hmac = crypto.createHmac('sha256', key);
    return (hmac.update(data).digest('base64'));
}

function getAccessToken(key, data) {
    var hmac_content = getHamcContent(key, data);
    return (new Buffer(data + "::" + hmac_content).toString('base64'));
}

function getRawAccessTokenArray(encodedAccessToken) {
    var decodedToken = (new Buffer(encodedAccessToken, 'base64')).toString('utf8'),
        rawTokenArray;
    rawTokenArray = decodedToken.split('::');
    if (rawTokenArray.length !== 5 &&       // token v1
            rawTokenArray.length !== 7      // token v2
            ) {
        return [];
    }
    return rawTokenArray;
}

function getAccessTokenUserId(encodedAccessToken) {
    return getRawAccessTokenArray(encodedAccessToken)[1];
}

function getAccessTokenDevicId(encodedAccessToken) {
    var rawTokenArray = getRawAccessTokenArray(encodedAccessToken),
        deviceId;
    if (rawTokenArray.length === 5) {       // token v1
        deviceId = rawTokenArray[2];
    } else {
        deviceId = rawTokenArray[3];
    }

    return deviceId;
}

function getAccessTokenSignature(encodedAccessToken) {
    var rawTokenArray = getRawAccessTokenArray(encodedAccessToken),
        signature;
    if (rawTokenArray.length === 5) {       // token v1
        signature = rawTokenArray[4];
    } else {
        signature = rawTokenArray[rawTokenArray.length - 1];
    }
}

function validateDateLimitOffset(request, callback) {
    var query = request.query,
        date = query.date,
        limit = query.limit,
        offset = query.offset,
        error;

    if (isValidDate(date) === false) {
        error = new Error('Invalid date');
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (isNaN(parseInt(limit, 10))) {
        error = new Error('Invalid limit');
        error.statusCode = 400;
        callback(error);
        return;
    }

    if (isNaN(parseInt(offset, 10))) {
        error = new Error('Invalid offset');
        error.statusCode = 400;
        callback(error);
        return;
    }
    callback(null);
}

function validateParentChildRelationship(request, methodName, callback) {
    var context = request.context,
        tokenDistributorId = context.user.distributorId,
        paramDistributorId = request.query['distributor-id'],
        client = context.databaseClient,
        logger = context.logger,
        customError,
        parentId,
        childId,
        sqlStmt,
        sqlParams;

    if (paramDistributorId === undefined) {
        callback(null);
        return;
    }

    parentId = parseInt(tokenDistributorId, 10);
    childId = parseInt(paramDistributorId, 10);

    if (isNaN(parentId) || isNaN(childId)) {
        customError = new Error("Invalid User Id");
        customError.statusCode = 400;
        callback(customError);
        return;
    }

    if (parentId === childId) {
        callback(null);
    } else {
        sqlStmt = 'SELECT * FROM ' + methodName + '($1, $2)';
        sqlParams = [parentId, childId];

        logger.trace('Executing sql query: %s with sqlParams %j', sqlStmt, sqlParams);
        client.query(sqlStmt, sqlParams, function (error, result) {
            if (error) {
                error.statusCode = 500;
                callback(error);
            } else {
                if (result.rows[0][methodName] !== true) {
                    customError = new Error("Invalid Child ID.");
                    customError.statusCode = 400;
                    callback(customError);
                } else {
                    request.context.user.childDistributorId = childId;
                    callback(null);
                }
            }
        });
    }
}

///////////  v1 only ///////////
function validateParentChildRelationship_V1(request, methodName, callback) {
    var context = request.context,
        tokenDistributorId = context.user.distributorId,
        paramDistributorId = request.query.child_distributor_id,
        client = context.databaseClient,
        logger = context.logger,
        customError,
        parentId,
        childId,
        sqlStmt,
        sqlParams;

    if (paramDistributorId === undefined) {
        callback(null);
        return;
    }

    parentId = parseInt(tokenDistributorId, 10);
    childId = parseInt(paramDistributorId, 10);

    if (isNaN(parentId) || isNaN(childId)) {
        customError = new Error("Invalid User Id");
        customError.statusCode = 400;
        callback(customError);
        return;
    }

    if (parentId === childId) {
        callback(null);
    } else {
        sqlStmt = 'SELECT * FROM ' + methodName + '($1, $2)';
        sqlParams = [parentId, childId];

        logger.trace('Executing sql query: %s with sqlParams %j', sqlStmt, sqlParams);
        client.query(sqlStmt, sqlParams, function (error, result) {
            if (error) {
                error.statusCode = 500;
                callback(error);
            } else {
                if (result.rows[0][methodName] !== true) {
                    customError = new Error("Invalid Child ID.");
                    customError.statusCode = 400;
                    callback(customError);
                } else {
                    request.context.user.childDistributorId = childId;
                    callback(null);
                }
            }
        });
    }
}
//////////////////////


function dbQuery(context, client, sqlStmt, sqlParams, callback) {
    var logger = context.logger,
        noResultError;

    logger.trace('Executing sql query: %s with sqlParams %j', sqlStmt, sqlParams);

    client.query(sqlStmt, sqlParams, function (error, result) {
        if (error) {
            error.statusCode = 500;
			if (process.env.NODE_ENV !== 'production') {
				error['developer-message'] = 'Failed to execute sql query(' + sqlStmt + ')' + ' using parameters [' + sqlParams + ']';
			}
            context.result = {rows : []};
            callback(error);
        } else {
            context.result = result;
            callback(null);
        }
    });
}

function dbQueryReadDatabase(context, sqlStmt, sqlParams, callback) {
    dbQuery(context, context.readDatabaseClient, sqlStmt, sqlParams, callback);
}

function dbQueryWriteDatabase(context, sqlStmt, sqlParams, callback) {
    dbQuery(context, context.databaseClient, sqlStmt, sqlParams, callback);
}

function setPGV30OrPGV40rd(start_rank, PGV30OrPGV40, result) {
    var rank = start_rank,
        PGVArray;

    if (PGV30OrPGV40 === null) {
        return;
    }

    PGVArray = PGV30OrPGV40.split(':');
    PGVArray.forEach(function (pgv) {
        result[rankMap(rank, 1)] = parseInt(pgv, 10);
        rank += 10;
    });
}

function getVolumeLastMonth(row) {
    var result = {
        pvq: (row.prev_m_pvq === null) ? 0 : parseInt(row.prev_m_pvq, 10),
        pgv: (row.prev_m_pgv === null) ? 0 : parseInt(row.prev_m_pgv, 10),
        'paid-rank': rankMap(row.prev_m_paid_rank, 0)
    };
    setPGV30OrPGV40rd(80, row.prev_m_pgv40, result);
    setPGV30OrPGV40rd(130, row.prev_m_pgv30, result);
    return [result];
}

function getVolumeThisMonth(row) {
    var result = {
        pvq: (row.curr_m_pvq === null) ? 0 : parseInt(row.curr_m_pvq, 10),
        pgv: (row.curr_m_pgv === null) ? 0 : parseInt(row.curr_m_pgv, 10),
        'paid-rank': rankMap(row.curr_m_paid_rank, 0)
    };
    setPGV30OrPGV40rd(80, row.curr_m_pgv40, result);
    setPGV30OrPGV40rd(130, row.curr_m_pgv30, result);
    return [result];
}

/// to be deleted later, only for v1
function setPGV30OrPGV40rd_V1(start_rank, PGV30OrPGV40, result) {
    var rank = start_rank,
        PGVArray;

    if (PGV30OrPGV40 === null) {
        return;
    }

    PGVArray = PGV30OrPGV40.split(':');
    PGVArray.forEach(function (pgv) {
        result[rankMap_V1(rank, 1)] = parseInt(pgv, 10);
        rank += 10;
    });
}

function getVolumeLastMonth_V1(row) {
    var result = {
        PVQ: (row.prev_m_pvq === null) ? 0 : parseInt(row.prev_m_pvq, 10),
        PGV: (row.prev_m_pgv === null) ? 0 : parseInt(row.prev_m_pgv, 10),
        PaidRank: rankMap(row.prev_m_paid_rank, 0)
    };
    setPGV30OrPGV40rd_V1(80, row.prev_m_pgv40, result);
    setPGV30OrPGV40rd_V1(130, row.prev_m_pgv30, result);
    return [result];
}

function getVolumeThisMonth_V1(row) {
    var result = {
        PVQ: (row.curr_m_pvq === null) ? 0 : parseInt(row.curr_m_pvq, 10),
        PGV: (row.curr_m_pgv === null) ? 0 : parseInt(row.curr_m_pgv, 10),
        PaidRank: rankMap(row.curr_m_paid_rank, 0)
    };
    setPGV30OrPGV40rd_V1(80, row.curr_m_pgv40, result);
    setPGV30OrPGV40rd_V1(130, row.curr_m_pgv30, result);
    return [result];
}
/////////////////////////



function getYYYYMMDD(date) {
    if (date instanceof Date) {
        return date.toYMD();
    }
    return ((new Date(date)).toYMD());
}

function setReporsOrganizationOrderInfo(result, orderInfo) {
    var orderArray,
        singleOrderInfoArray;

    result.QualificationVol = 0;
    result.UnilevelVol = 0;
    result.UnilevelVol = 0;
    result.FasttrackVol = 0;

    if ((orderInfo === '') || (orderInfo === null)) {
        result.Orders = 0;
        return;
    }

    orderArray = orderInfo.split(':');
    result.Orders = orderArray.length;

    orderArray.forEach(function (order) {
        singleOrderInfoArray = order.split(',');

        result.QualificationVol += parseFloat(singleOrderInfoArray[1]);
        result.UnilevelVol += parseFloat(singleOrderInfoArray[3]);
        result.UnilevelVol += parseFloat(singleOrderInfoArray[4]);
        result.FasttrackVol += parseFloat(singleOrderInfoArray[5]);
    });
}

function getProductImageUrls(sku, imageInfo) {
    var imageUrls = [],
        imageArray;

    if (imageInfo === null) {
        return ['https://www.organogold.com/images/noimage/product.jpg'];
    }

    imageArray = imageInfo.replace('{', '').replace('}', '').split(',');
    imageArray.forEach(function (image) {
        imageUrls.push('https://www.organogold.com/upload/image/' +  image);
    });
    return imageUrls;
}

function memcacheGet(context, key, callback) {
    var memcachedClient = context.memcachedClient,
        jsonResult;

    if (memcachedClient !== undefined) {
        memcachedClient.get(key, function (error, result) {
            if (error) {
				error.statusCode = 500;
				if (process.env.NODE_ENV !== 'production') {
					error['developer-message'] = 'Failed to get memcache value with key(' + key + ')';
				}
                callback(error);
                return;
            }

            if (result) {
                jsonResult = JSON.parse(result, function (k, v) {
                    var iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/,
                        m;

                    if (typeof v === 'string') {
                        m = iso.exec(v);
                        if (m) {
                            return new Date(
                                Date.UTC(
                                    +m[1],
                                    +m[2] - 1,
                                    +m[3],
                                    +m[4],
                                    +m[5],
                                    +m[6]
                                )
                            );
                        }
                    }
                    return v;
                });

                callback(null, jsonResult);
            } else {
                callback(null);
            }
        });
    } else {
        callback(new Error('memcachedClient is undefined'));
    }
}

function memcacheSet(context, key, timeoutSeconds, callback) {
    var memcachedClient = context.memcachedClient;

    if (memcachedClient !== undefined) {
        context.logger.trace('set memcache with key(%s), value(%j)', key, context.result);
        memcachedClient.set(
            key,
            JSON.stringify(context.result),
            timeoutSeconds,
            function (error, result) {
                if (error) {
					error.statusCode = 500;
					if (process.env.NODE_ENV !== 'production') {
						error['developer-message'] = 'Failed to set memcache key(' + key + ') and value (' + context.result + ')';
					}
                    callback(error);
                    return;
                }
				callback(null);
            }
        );
    } else {
        callback(new Error('memcachedClient is undefined'));
    }

}

function loadData(params, callback) {
    var context = params.context,
        logger = context.logger;

    async.series([
        function (next) {
            memcacheGet(context, params.cacheKey, function (error, result) {
                if (error) {
                    logger.warn('Failed to get result from memcached: ' + util.inspect(error));
                    next(null);
                } else if (result) {
                    logger.trace('Found key (%s) result in the memcached (%j)',
                                 params.cacheKey, result);
                    context.result = result;
                    callback(null);
                } else {
                    logger.trace('Found no matching result in the memcached with key: %s',
                                 params.cacheKey);
                    next(null);
                }
            });
        },
        function (next) {
            if (params.useWriteDatabase === true) {
                dbQueryWriteDatabase(context, params.sqlStmt, params.sqlParams, next);
            } else {
                dbQueryReadDatabase(context, params.sqlStmt, params.sqlParams, next);
            }
        },
        function (next) {
            memcacheSet(context, params.cacheKey, params.timeoutSeconds, function (error) {
                if (error) {
                    logger.warn('Failed to set memcache: ' + util.inspect(error));
                }
                next(null);
            });
        }
    ], callback);
}

function validateModel(model, callback) {
    if (!callback) {
        return model.validate();
    }

    var failures = {},
        field;

    async.forEachSeries(Object.keys(model.values), function (field, callback) {
        var validator = model.validators[field],
            value = model.values[field];

        if (!validator) {
            callback();
            return;
        }

        async.forEachSeries(Object.keys(validator), function (validatorType, callback) {
            if (!validator.hasOwnProperty(validatorType)) {
                callback();
                return;
            }

            var vldDetails = validator[validatorType],
                isCustom = typeof vldDetails === 'function',
                vldFunction,
                vldMethod,
                vldArgs,
                vldMessage,
                v;

            if (isCustom && vldDetails.length === 2) {
                // async custom validator
                vldFunction = function (callback) {
                    vldDetails.call(model, value, callback);
                };
            } else {
                // otherwise, wrap validate method as async function
                if (isCustom) {
                    vldMethod = function () {
                        vldDetails.call(model, value);
                    };
                } else {
                    vldArgs = vldDetails.hasOwnProperty('args') ? vldDetails.args : vldDetails;
                    if (!Array.isArray(vldArgs)) {
                        vldArgs = [vldArgs];
                    }
                    vldMessage = vldDetails.hasOwnProperty('msg') ? vldDetails.msg : false;
                    v = Validator.check(value, vldMessage);
                    if (typeof v[validatorType] !== 'function') {
                        callback(new Error('Invalid validator function: ' + validatorType));
                        return;
                    }
                    vldMethod = function () {
                        v[validatorType].apply(v, vldArgs);
                    };
                }
                vldFunction = function (callback) {
                    try {
                        vldMethod();
                    } catch (err) {
                        callback(err);
                        return;
                    }
                    callback();
                };
            }

            vldFunction(function (err) {
                if (!err) {
                    callback();
                    return;
                }

                var errMsg = err.message;
                if (!vldMessage && !isCustom) {
                    errMsg += ': ' + field;
                }

                if (failures.hasOwnProperty(field)) {
                    failures[field].push(errMsg);
                } else {
                    failures[field] = [errMsg];
                }

                callback();
            });

        }, callback);

    }, function (err) {
        if (err) {
            callback(err);
            return;
        }

        var key;
        for (key in failures) {
            if (failures.hasOwnProperty(key)) {
                callback(null, failures);
                return;
            }
        }
        callback(null, null);
    });
}

function getAuditOperator(request) {
    var user = request.context.user,
        operator;

    if (!user) {
        return null;
    }

    operator = {
        userType : 'User',
        userId : user.userId,
        userName : user.login,
        remoteAddress : request.ip
    };

    return operator;
}

function getAuditOperatorByContext(context) {
    var user = context.user,
        operator;

    if (!user) {
        return null;
    }

    operator = {
        userType : 'User',
        userId : user.userId,
        userName : user.login,
        remoteAddress : context.remoteAddress
    };

    return operator;
}

function callbackIgnoreDBRelationDoesNotExistError(callback) {
    return function (error) {
        if (error) {
            /*jslint regexp: true*/
            if (/^relation ".*" does not exist$/.test(error.message)) {
                callback();
            } else {
                callback(error);
            }
            /*jslint regexp: false*/

            return;
        }

        callback();
    };
}


var reExpirationYear = /^(\d{2}|\d{4})$/;
var reExpirationMonth = /^\d{1,2}$/;
var reCVV = /^\d+$/;

function isValidCreditcardInfo(creditcard) {
    var now = new Date(),
        expirationYear = creditcard.year,
        expirationMonth = creditcard.month,
        cvv = creditcard.cvv;

    // check expiration year
    if (!reExpirationYear.test(expirationYear)) {
        return false;
    }

    if (expirationYear.length === 2) {
        expirationYear = '20' + expirationYear;
    }

    if (parseInt(expirationYear, 10) < now.getFullYear()) {
        return false;
    }

    if (!reExpirationMonth.test(expirationMonth)) {
        return false;
    }

    expirationMonth = parseInt(expirationMonth, 10);
    if (expirationMonth < 1 || expirationMonth > 12) {
        return false;
    }

    if (!reCVV.test(cvv)) {
        return false;
    }

    return true;
}


function roundMoney(money) {
    return Math.round(money * 100) / 100;
}

function roundVolume(number) {
    return Math.round(number * 10000) / 10000;
}

function getFirstDayOfThisMonth(today) {
    var yyyy = today.getFullYear(),
    mm = (today.getMonth() + 1).toString();

    return yyyy + (mm[1]? mm : "0"+mm[0]) + "01";
}

function getLastDayOfMonth(today) {
    var lastDayOfMonth = new Date(today.getFullYear(), today.getMonth()+1, 0),
    yyyy = lastDayOfMonth.getFullYear(),
    mm = (today.getMonth() + 1).toString();

    return yyyy + "-" + (mm[1]? mm : "0"+mm[0]) + "-" + lastDayOfMonth.getDate();
}

function getFirstDayOfMonthLine(today) {
    var yyyy = today.getFullYear(),
    mm = (today.getMonth() + 1).toString();

    return yyyy + "-" + (mm[1]? mm : "0"+mm[0]) + "-01";
}

function parseBoolean(input) {
    if (!input || input === '0' || input === 'false' || input === 'False' || input === 'FALSE') {
        return false;
    }

    return true;
}

function parseDate(input) {
    var date = new Date(Date.parse(input));
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseJson(str, defaultVal) {
    var obj;
    try {
        obj = JSON.parse(str);
    } catch (e) {
        obj = defaultVal;
    }
    return obj;
}

var reservedLogins = ['api'];

function isReservedLogin(login) {
    if (reservedLogins.indexOf(login) !== -1) {
        return true;
    }

    return false;
}

function isNullOrEmpty (str) {
    return str === null || (u.isString(str) && str.trim() === '') ? true : false;
}

function getClientIp (request) {
    var xDeviceIp = request.get('x-device-ip');

    if(xDeviceIp) {
        return xDeviceIp;
    }

    var forwardedIpsStr = request.get('x-forwarded-for');
    if (forwardedIpsStr) {
        var forwardedIps = forwardedIpsStr.split(',');
        return forwardedIps[0];
    }

    return request.ip || '';
}

exports.getFirstDayOfMonthLine = getFirstDayOfMonthLine;
exports.getfirstDayOfNextMonthLine = getfirstDayOfNextMonthLine;
exports.getLastDayOfMonth = getLastDayOfMonth;
exports.checkPassword = checkPassword;
exports.encryptPassword = encryptPassword;
exports.getHamcContent = getHamcContent;
exports.getAccessToken = getAccessToken;
exports.getFirstDayOfMonth = getFirstDayOfMonth;
exports.getRawAccessTokenArray = getRawAccessTokenArray;
exports.getAccessTokenUserId = getAccessTokenUserId;
exports.getAccessTokenDevicId = getAccessTokenDevicId;
exports.getAccessTokenSignature = getAccessTokenSignature;
exports.validateParentChildRelationship = validateParentChildRelationship;
exports.validateParentChildRelationship_V1 = validateParentChildRelationship_V1;
exports.dbQuery = dbQuery;
exports.dbQueryReadDatabase = dbQueryReadDatabase;
exports.dbQueryWriteDatabase = dbQueryWriteDatabase;
exports.getVolumeLastMonth = getVolumeLastMonth;
exports.getVolumeThisMonth = getVolumeThisMonth;
exports.getVolumeLastMonth_V1 = getVolumeLastMonth_V1;
exports.getVolumeThisMonth_V1 = getVolumeThisMonth_V1;
exports.isValidDate = isValidDate;
exports.validateDateLimitOffset = validateDateLimitOffset;
exports.isValidEmail = isValidEmail;
exports.md5sum = md5sum;
exports.getYYYYMMDD = getYYYYMMDD;
exports.setReporsOrganizationOrderInfo = setReporsOrganizationOrderInfo;
exports.getProductImageUrls = getProductImageUrls;
exports.memcacheGet = memcacheGet;
exports.memcacheSet = memcacheSet;
exports.loadData = loadData;
exports.getFirstDayOfLastMonth = getFirstDayOfLastMonth;
exports.getCurrentYYYYMMDD = getCurrentYYYYMMDD;
exports.validateModel = validateModel;
exports.getAuditOperator = getAuditOperator;
exports.getAuditOperatorByContext = getAuditOperatorByContext;
exports.callbackIgnoreDBRelationDoesNotExistError = callbackIgnoreDBRelationDoesNotExistError;
exports.isValidPassword = isValidPassword;
exports.isValidCreditcardInfo = isValidCreditcardInfo;
exports.roundMoney = roundMoney;
exports.roundVolume = roundVolume;
exports.getFirstDayOfThisMonth = getFirstDayOfThisMonth;
exports.parseBoolean = parseBoolean;
exports.parseDate = parseDate;
exports.parseJson = parseJson;
exports.isReservedLogin = isReservedLogin;
exports.generateUserAvatarUrl = generateUserAvatarUrl;
exports.isNullOrEmpty = isNullOrEmpty;
exports.getClientIp = getClientIp;

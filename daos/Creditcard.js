/**
 * Creditcard DAO class.
 */

var util = require('util');
var async = require('async');
var crypto = require('crypto');
var moment = require('moment');
var u = require('underscore');
var DAO = require('./DAO.js');
var airbrakeHelper = require('../lib/airbrakeHelper');

function Creditcard(context) {
    DAO.call(this, context);
}

util.inherits(Creditcard, DAO);


function encrypt(key, text) {
  var cipher = crypto.createCipher('aes-256-cbc',key)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');

  cryptedBuffer = new Buffer(crypted, 'hex');
  return cryptedBuffer.toString('base64');
}

function decrypt(key, text) {
  var decipher = crypto.createDecipher('aes-256-cbc',key)
  var dec = decipher.update(text,'base64','utf8')
  dec += decipher.final('utf8');
  return dec;
}

Creditcard.encryptToIssueNumber = function (number, cvv) {
    return encrypt('encrypt-key@@', number + '=' + cvv);
};

Creditcard.decryptIssueNumber = function (issueNumber) {
    return decrypt('encrypt-key@@', issueNumber);
};

var cards = [
    {
        type: 'maestro',
        pattern: /^(5018|5020|5038|6304|6759|676[1-3])/,
        length: [12, 13, 14, 15, 16, 17, 18, 19],
        cvcLength: [3],
        luhn: true
    }, {
        type: 'dinersclub',
        pattern: /^(36|38|30[0-5])/,
        length: [14],
        cvcLength: [3],
        luhn: true
    }, {
        type: 'laser',
        pattern: /^(6706|6771|6709)/,
        length: [16, 17, 18, 19],
        cvcLength: [3],
        luhn: true
    }, {
        type: 'jcb',
        pattern: /^35/,
        length: [16],
        cvcLength: [3],
        luhn: true
    }, {
        type: 'unionpay',
        pattern: /^62/,
        length: [16, 17, 18, 19],
        cvcLength: [3],
        luhn: false
    }, {
        type: 'discover',
        pattern: /^(6011|65|64[4-9]|622)/,
        length: [16],
        cvcLength: [3],
        luhn: true
    }, {
        type: 'mastercard',
        pattern: /^5[1-5]/,
        length: [16],
        cvcLength: [3],
        luhn: true
    }, {
        type: 'amex',
        pattern: /^3[47]/,
        length: [15],
        cvcLength: [3, 4],
        luhn: true
    }, {
        type: 'visa',
        pattern: /^4/,
        length: [13, 14, 15, 16],
        cvcLength: [3],
        luhn: true
    }
];

Creditcard.generateLastDigits = function (number) {
    var length = number.length;

    if (length <= 4) {
        return number;
    }

    return number.substr(length - 4);
};

Creditcard.generateHashSignature = function (number) {
    return crypto.createHash('sha1').update(number).digest('hex');
};


Creditcard.getCreditcardType = function (number) {
    if (!number) {
        return 'NA';
    }

    var card, i, len;
    number = (number + '').replace(/\D/g, '');
    for (i = 0, len = cards.length; i < len; i++) {
        card = cards[i];
        if (card.pattern.test(number)) {
            return card.type;
        }
    }

    return 'NA';
};


Creditcard.prototype.createCreditcard = function (options, callback) {
    var context = this.context,
        logger = context.logger,
        creditcard,
        error;

    creditcard = {
        // number and cvv will not be saved into database
        number : options.number,
        cvv : options.cvv,
        month : options.month,
        year : options.year,
        first_name : options.firstname,
        last_name : options.lastname,
        address_id : options.addressId,
        active : !!options.active,
        user_id : options.user_id
    };

    creditcard.cc_type = Creditcard.getCreditcardType(creditcard.number);
    creditcard.last_digits = Creditcard.generateLastDigits(creditcard.number);

    if (options.saveIssueNumber) {
        creditcard.issue_number = Creditcard.encryptToIssueNumber(creditcard.number, creditcard.cvv);
    }

    if (creditcard.number) {
        creditcard.number = creditcard.number.replace(/\s/g, '');
        creditcard.hash_signature = Creditcard.generateHashSignature(creditcard.number);
    } else {
        creditcard.hash_signature = '';
    }

    this.models.Creditcard.create(creditcard).success(function (newCreditcard) {
        callback(null, newCreditcard);
    }).error(callback);
};


Creditcard.prototype.getCreditcardById = function (creditcardId, callback) {
    this.getById(creditcardId, callback);
};

/**
 * [findCreditcardByOptions description]
 * @param  {object}   options  [description]
 *   options:
 *       user_id: required
 *       number: optional
 *       cvv: optional
 *       month: optional
 *       year: optional
 *
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Creditcard.prototype.findCreditcardByOptions = function(options, callback){
    var context  = this.context;
    var number = options.number;
    var cvv = options.cvv;
    var month = options.month;
    var year = options.year;
    var user_id = options.user_id;
    var whereConditions = {
        user_id: user_id,
        active: true
    };

    if(number){
        number = number.replace(/\s/g, '');
        whereConditions.hash_signature = Creditcard.generateHashSignature(number);
        whereConditions.cc_type = Creditcard.getCreditcardType(number);
        whereConditions.last_digits = Creditcard.generateLastDigits(number);
        if(cvv){
            whereConditions.issue_number = Creditcard.encryptToIssueNumber(number, cvv);
        }
    }

    if(month){
        whereConditions.month = month;
    }
    
    if(year){
        whereConditions.year = year;
    }

    this.models.Creditcard.findAll({
        where : whereConditions,
        order: ' id DESC '
    }).done(function(error, creditcards){
        if(error){
            callback(error);
            return;
        }
        if(u.isArray(creditcards) && creditcards.length >0){
            callback(null, creditcards[0]);
            return;
        }
        callback(null, null);
    });

};

/**
 * [findTokenByOptions description]
 * @param  {object}   options  [description]
 *   options:
 *       user_id: required
 *       number: optional
 *       cvv: optional
 *       month: optional
 *       year: optional
 *
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Creditcard.prototype.findTokenByOptions = function(options, callback){
    var context  = this.context;
    var number = options.number;
    var cvv = options.cvv;
    var month = options.month;
    var year = options.year;
    var user_id = options.user_id;

    var sqlSelect = '';
    var sqlFrom = '';
    var sqlWhere = ' WHERE ';
    var sqlOrder = '';
    var sqlParams = [];
    var sqlWhereConditions = [];
    var error;



    
        sqlSelect = ' SELECT ct.* ';
        
        sqlFrom +=' FROM creditcards_tokens ct ';
        sqlFrom +=' INNER JOIN creditcards c ON c.id = ct.creditcard_id  ';

        sqlOrder = ' ORDER BY id DESC ';


         async.waterfall([
            //where
            function(callback){

                    sqlWhereConditions.push(' c.active = true ');

                    sqlParams.push(user_id);
                    sqlWhereConditions.push(' c.user_id = $' + sqlParams.length);

                    if(number){
                        number = number.replace(/\s/g, '');

                        sqlParams.push(Creditcard.generateHashSignature(number));
                        sqlWhereConditions.push(' c.hash_signature = $' + sqlParams.length);

                        sqlParams.push(Creditcard.getCreditcardType(number));
                        sqlWhereConditions.push(' c.cc_type = $' + sqlParams.length);

                        sqlParams.push(Creditcard.generateLastDigits(number));
                        sqlWhereConditions.push(' c.last_digits = $' + sqlParams.length);

                        if(cvv){
                            sqlParams.push(Creditcard.encryptToIssueNumber(number, cvv));
                            sqlWhereConditions.push(' c.issue_number = $' + sqlParams.length);
                        }
                    }

                    if(month){
                        sqlParams.push(month);
                        sqlWhereConditions.push(' c.month = $' + sqlParams.length);
                    }
                    
                    if(year){
                        sqlParams.push(year);
                        sqlWhereConditions.push(' c.year = $' + sqlParams.length);
                    }

                if (u.isEmpty(sqlWhereConditions)) {
                    sqlWhere = ' ';
                } else {
                    sqlWhere += sqlWhereConditions.join(' AND ');
                }
                callback();
            },


            //select
            function(callback) {
                DAO.queryDatabase(context, {
                    sqlStmt: sqlSelect + sqlFrom + sqlWhere  + sqlOrder ,
                    sqlParams: sqlParams
                },function(error, res) {
                    if (error) {
                        return callback(error);
                    }

                    if(u.isArray(res.rows) && res.rows.length > 0){
                        callback(null, res.rows[0]);
                        return;
                    }
                    callback(null, null);

                });
            }
           
        ], callback);

};

Creditcard.prototype.setTokenIdOfCreditcard = function (creditcard, paymentMethodId, tokenId, callback) {
    var self = this,
        context = this.context;

    async.waterfall([
        function (callback) {
            var options = {
                    useWriteDatabase : true,
                    sqlStmt : "select * from creditcards_tokens where creditcard_id = $1 and payment_method_id = $2",
                    sqlParams : [creditcard.id, paymentMethodId]
                };

            self.queryDatabase(options, function (error, result) {
                if (error) {
                    callback(error);
                    return;
                }

                callback(null, result.rows[0]);
            });
        },

        function (creditcardToken, callback) {
            var options = {
                    useWriteDatabase : true
                };

            if (creditcardToken) {
                // update
                options.sqlStmt = "update creditcards_tokens set token_id = $1, updated_at = now() where creditcard_id = $2 and payment_method_id = $3;";
                options.sqlParams = [tokenId, creditcard.id, paymentMethodId];
            } else {
                // insert
                options.sqlStmt = "insert into creditcards_tokens (creditcard_id, token_id, payment_method_id, created_at, updated_at) values ($1, $2, $3, now(), now());";
                options.sqlParams = [creditcard.id, tokenId, paymentMethodId];
            }

            self.queryDatabase(options, function (error) {
                callback(error);
            });
        }
    ], callback);
};


function getNewlyRegisteredUsers(context, creditcardIds, createdAfter, callback) {
    async.waterfall([
        function (callback) {
            context.readModels.Payment.findAll({
                where : {
                    source_type : 'Creditcard',
                    source_id : creditcardIds
                }
            }).done(callback);
        },

        function (payments, next) {
            if (!payments.length) {
                callback(null, []);
                return;
            }

            var orderIds = payments.map(function (payment) {
                return payment.order_id;
            });
            context.readModels.Order.findAll({
                where : { id : orderIds }
            }).done(next);
        },

        function (orders, callback) {
            var userIds = orders.map(function (order) {
                return order.user_id;
            });
            context.readModels.User.findAll({
                where : { id : userIds }
            }).done(callback);
        },

        function (users, callback) {
            var newUsers = u.filter(users, function (user) {
                return user.created_at > createdAfter;
            });
            callback(null, newUsers);
        }
    ], callback);
}


Creditcard.prototype.isCreditcardAllowedForRegistration = function (number, callback) {
    var context = this.context,
        logger = context.logger,
        hashSignature = Creditcard.generateHashSignature(number);

    logger.trace("Checking is the given creditcard={hash_signature:'%s'} is allowed for registration...", hashSignature);
    async.waterfall([
        function (callback) {
            logger.trace('Getting creditcards with the same hash_signature...');
            context.readModels.Creditcard.findAll({
                where : { hash_signature : hashSignature },
                order : 'created_at'
            }).done(callback);
        },

        function (creditcards, callback) {
            if (!creditcards.length) {
                // new creditcard should be allowed
                logger.trace("Allow: new creditcard.");
                callback(null, true);
                return;
            }

            var oldestCreditcard = creditcards[0],
                creditcardIds,
                sixtyDaysAgo = moment().subtract('days', 60).toDate(),
                thirtyDaysAgo = moment().subtract('days', 30).toDate(),
                checkUserCreatedBefore,
                newlyRegisteredUsersLimit;

            logger.trace("Creditcard was first used at: %s", oldestCreditcard.created_at);
            if (oldestCreditcard.created_at < sixtyDaysAgo) {
                // creditcard used before 60 days ago should be allowed
                logger.trace("Allow: creditcard used before 60 days ago.");
                callback(null, true);
                return;
            }

            creditcardIds = creditcards.map(function (creditcard) {
                return creditcard.id;
            });

            if (oldestCreditcard.created_at < thirtyDaysAgo) {
                logger.trace("Checking new users registered in 60 days...");
                checkUserCreatedBefore = sixtyDaysAgo;
                newlyRegisteredUsersLimit = 4;
            } else {
                logger.trace("Checking new users regitsterd in 30 days...");
                checkUserCreatedBefore = sixtyDaysAgo;
                newlyRegisteredUsersLimit = 2;
            }

            getNewlyRegisteredUsers(context, creditcardIds, checkUserCreatedBefore, function (error, newUsers) {
                if (error) {
                    callback(error);
                    return;
                }

                logger.trace("%d new user(s) found.", newUsers.length);
                callback(null, newUsers.length < newlyRegisteredUsersLimit);
            });
        }
    ], callback);
};


Creditcard.prototype.getCreditcardTokenByCreditcardId = function (creditcardId, callback) {
    var context = this.context;

    async.waterfall([
        function (callback) {
            context.readModels.CreditcardsToken.find({
                where : { creditcard_id : creditcardId }
            }).done(callback);
        }
    ], callback);
};


Creditcard.prototype.getPaymentTokenIdByCreditcardId = function (creditcardId, callback) {
    var context = this.context;

    async.waterfall([
        function (callback) {
            context.readModels.CreditcardsToken.find({
                where : { creditcard_id : creditcardId }
            }).done(callback);
        },

        function (creditcardToken, callback) {
            if (!creditcardToken) {
                callback(null, null);
            } else {
                callback(null, creditcardToken.token_id);
            }
        }

    ], callback);
};

module.exports = Creditcard;

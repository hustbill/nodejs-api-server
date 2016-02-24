/**
 * Address DAO class.
 */

var util = require('util');
var async = require('async');
var u = require('underscore');
var DAO = require('./DAO');
var daos = require('./index');
var utils = require('../lib/utils');
var ups = require('../lib/ups');

var regPoBox = /^\s*p\.?\s*o\.?\s*box/i;
/*jslint regexp: true*/
var regPhone = /[^\d*| |\(|\)|\-|\+\.]/;
var regApoOrFpo = /\bapo\b|\bfpo\b/i;
var regLatin = /[a-zA-Z]/;


function validateModel(address, callback) {
    var failures = [];

    if (!address.firstname) {
        failures.push({
            field : 'first-name',
            code : 'InvalidFirstName',
            message : 'First name is required.'
        });
    }

    if (!address.country_id) {
        failures.push({
            field : 'country-id',
            code : 'InvalidCountry',
            message : 'Country is required.'
        });
    }

    if (!address.city) {
        failures.push({
            field : 'city',
            code : 'InvalidCity',
            message : 'City is required.'
        });
    }

    if (!address.address1) {
        failures.push({
            field : 'street',
            code : 'InvalidStreet',
            message : 'Street is required.'
        });
    }

    callback(null, failures);
}

function validateCountryAndState(address, callback) {
    if (!address.country_id) {
        callback(null, []);
        return;
    }

    var state = address.state,
        country = address.country,
        failures = [];

    if (!country) {
        failures.push({
            field : 'country-id',
            code : 'InvalidCountry',
            message : 'Cannot find country with id: ' + address.country_id
        });

        callback(null, failures);
        return;
    }

    if (country.states && country.states.length
            &&  ['AG', 'RU'].indexOf(country.iso) < 0) {
        // validate state and zipcode only when the country has states.
        if (!address.state_id) {
            failures.push({
                field : 'state-id',
                code : 'InvalidState',
                message : 'State is required.'
            });
        }

        if (!address.zipcode) {
            failures.push({
                field : 'zip',
                code : 'InvalidZip',
                message : 'Zip is required.'
            });
        }
    }

    if (address.state_id) {
        if (!state) {
            failures.push({
                field : 'state-id',
                code : 'InvalidState',
                message : 'Cannot find state with id: ' + address.state_id
            });
        } else if (state.country_id !== address.country_id) {
            failures.push({
                field : 'state-id',
                code : 'InvalidState',
                message : 'Given state: ' + state.name +
                    ' does not belong to country with id: ' + address.country_id
            });
        }
    }

    callback(null, failures);
}

function validateAddressShouldNotBePoBox(address, callback) {
    var config = this.context.config,
	failures = [];

    if (!config.application.address || !config.application.address.validatePoBox) {
	callback(null, failures);
	return;
    }

    if (address.address1 && regPoBox.test(address.address1)) {
        failures.push({
            field : 'street',
            code : 'InvalidStreet',
            message : "Don't use po box in street."

        });
    }

    if (address.address2 && regPoBox.test(address.address2)) {
        failures.push({
            field : 'street-cont',
            code : 'InvalidStreetCont',
            message : "Don't use po box in street cont."

        });
    }

    callback(null, failures);
}

function validateRuAddressLatin(address, callback) {
    if (!address.country) {
        callback(null, []);
        return;
    }

    if (['RU', 'BY', 'KZ', 'UA'].indexOf(address.country.iso) === -1) {
        callback(null, []);
        return;
    }

    var failures = [],
        message = "ВНИМАНИЕ!!! ПОЛЯ АДРЕСА ДОСТАВКИ ДОЛЖНЫ БЫТЬ ЗАПОЛНЕНЫ КИРИЛЛИЦЕЙ!";

    if (address.address1 && regLatin.test(address.address1)) {
        failures.push({
            field : 'street',
            code : 'InvalidStreet',
            message : message
        });
    }

    if (address.address2 && regLatin.test(address.address2)) {
        failures.push({
            field : 'street-cont',
            code : 'InvalidStreetCont',
            message : message
        });
    }

    callback(null, failures);
}

function validateFirstName(address, callback) {
    var failures = [];

    if (!address.firstname) {
        failures.push({
            field : 'first-name',
            code : 'InvalidFirstName',
            message : 'First name is required.'
        });
    }

    callback(null, failures);
}

function validateIsNameChanged(address, callback) {
    var context = this.context,
        userId = context.user.userId,
        userDao = daos.createDao('User', context),
        failures = [];

    async.waterfall([
        function (callback) {
            userDao.getById(userId, callback);
        },

        function (user, callback) {
            userDao.getHomeAddressOfUser(user, callback);
        },

        function (originalAddress, callback) {
            if (!originalAddress) {
                callback();
                return;
            }

            if (originalAddress.firstname !== address.firstname) {
                failures.push({
                    field : 'first-name',
                    code : 'InvalidFirstName',
                    message : "Can't change first name."
                });
            }
            if (originalAddress.middleabbr !== address.middleabbr) {
                failures.push({
                    field : 'm',
                    code : 'InvalidMiddleName',
                    message : "Can't change middle name."
                });
            }
            if (originalAddress.lastname !== address.lastname) {
                failures.push({
                    field : 'last-name',
                    code : 'InvalidLastName',
                    message : "Can't change last name."
                });
            }

            callback(null, failures);
        }
    ], callback);
}

function validateLastName(address, callback) {
    if (!address.country) {
        callback(null, []);
        return;
    }

    if (['MY', 'M1'].indexOf(address.country.iso) !== -1) {
        callback(null, []);
        return;
    }

    var failures = [];

    if (!address.lastname) {
        failures.push({
            field : 'last-name',
            code : 'InvalidLastName',
            message : 'Last name is required.'
        });
    }

    callback(null, failures);
}

function validatePhoneFormat(address, callback) {
    var failures = [];

    if (address.phone && regPhone.test(address.phone)) {
        failures.push({
            field : 'phone',
            code : 'InvalidPhone',
            message : "Wrong phone format. Only allowed 0-9, -, (), +, ."
        });
    }

    callback(null, failures);
}

function validateAddressApoOrFpo(address, callback) {
    if (!address.country) {
        callback(null, []);
        return;
    }

    if (address.country.iso !== 'US') {
        callback(null, []);
        return;
    }

    var failures = [],
        message = "Wrong address format. Can't contains 'APO' or 'FPO'";

    if (address.address1 && regApoOrFpo.test(address.address1)) {
        failures.push({
            field : 'street',
            code : 'InvalidStreet',
            message : message
        });
    }

    if (address.address2 && regApoOrFpo.test(address.address2)) {
        failures.push({
            field : 'street-cont',
            code : 'InvalidStreetCont',
            message : message
        });
    }

    callback(null, failures);
}

function validateAddressLength(address, callback) {
    if (!address.country) {
        callback(null, []);
        return;
    }

    var maxLength = address.country.iso === 'US' ? 128 : 255,
        failures = [];

    if (address.address1 && address.address1.length > maxLength) {
        failures.push({
            field : 'street',
            code : 'InvalidStreet',
            message : 'Street is too long.'
        });
    }

    if (address.address2 && address.address2.length > maxLength) {
        failures.push({
            field : 'street-cont',
            code : 'InvalidStreetCont',
            message : 'Street cont is too long.'
        });
    }

    callback(null, failures);
}

function validateAddressUps(address, callback) {
    if (!address.country) {
        callback(null, []);
        return;
    }

    // validate ups address just for US
    if (address.country.iso !== 'US') {
        callback(null, []);
        return;
    }

    if (address.state &&
            (address.state.abbr === 'AA' || address.state.abbr === 'AE' || address.state.abbr === 'AP')) {
        callback(null, []);
        return;
    }

    var upsAddress = {
        city: address.city,
        stateProvinceCode: (address.state && address.state.abbr),
        countryCode: address.country.iso,
        postalCode: address.zipcode
    };
    ups.isValidAddress(this.context, upsAddress, function (error) {
        var failures = [];
        if (error) {
            failures.push({
                field : '',
                code : 'InvalidAddress',
                message : 'Country, state, city or zipcode is invalid.'
            });
        }

        callback(null, failures);
    });
}

function validateUsMilitaryAddress(address, callback) {
    if (!address.country || address.country.iso !== 'US') {
        callback(null, []);
        return;
    }

    var failures = [],
        stateAbbr = address.state && address.state.abbr,
        city = address.city.toUpperCase();
    if ((stateAbbr === 'AA' || stateAbbr === 'AE' || stateAbbr === 'AP') &&
            (city !== 'APO' && city !== 'FPO' && city !== 'DPO')) {
        failures.push({
            field : 'city',
            code : 'InvalidCity',
            message : 'City must be APO, FPO or DPO.'
        });
    }

    callback(null, failures);
}

function validateZipcode(address, callback) {
    if (!address.country) {
        callback(null, []);
        return;
    }

    var failures = [],
        countryISO = address.country.iso;

    if (countryISO === 'AU' || countryISO === 'NZ') {
        if (address.zipcode.length !== 4) {
            failures.push({
                field : 'zip',
                code : 'InvalidZip',
                message : 'Zipcode must be 4 numbers.'
            });
        }
    }

    callback(null, failures);
}

function validateEmail(address, callback) {
    if (!address.email) {
        callback(null, []);
        return;
    }

    var failures = [];

    if (!utils.isValidEmail(address.email)) {
        failures.push({
            field : 'email',
            code : 'InvalidEmail',
            message : 'Not valid email address.'
        });
    }
    callback(null, failures);
}

function replaceQuotes(address) {
    var reg = /\"/;

    if (address.address1) {
        address.address1 = address.address1.replace(reg, "'");
    }
    if (address.address2) {
        address.address2 = address.address2.replace(reg, "'");
    }
    if (address.city) {
        address.city = address.city.replace(reg, "'");
    }
    if (address.zipcode) {
        address.zipcode = address.zipcode.replace(reg, "'");
    }
}

function clearFranceCoapplicantName(address, callback) {
    if (!address.country) {
        callback(null, []);
        return;
    }

    if (address.country.iso === 'FR') {
        address.joint_firstname = null;
        address.joint_middleabbr = null;
        address.joint_lastname = null;
    }

    callback(null, []);
}


var validatorsOfHomeAddress = [
    validateModel,
    validateLastName,
    validateAddressLength,
    validatePhoneFormat,
    validateCountryAndState,
    validateUsMilitaryAddress,
    validateAddressUps,
    validateZipcode,
    clearFranceCoapplicantName
];


var validatorsOfHomeAddressWhenCreate = [
    validateModel,
    validateLastName,
    //validateIsNameChanged,
    validateAddressLength,
    validatePhoneFormat,
    validateCountryAndState,
    validateUsMilitaryAddress,
    validateAddressUps,
    validateZipcode,
    clearFranceCoapplicantName
];

var validatorsOfShippingAddress = [
    validateModel,
    validateLastName,
    validateAddressLength,
    validatePhoneFormat,
    validateCountryAndState,
    // validateRuAddressLatin,
    validateAddressShouldNotBePoBox,
    //validateAddressApoOrFpo,
    validateUsMilitaryAddress,
    validateAddressUps,
    validateZipcode,
    clearFranceCoapplicantName
];

var validatorsOfBillingAddress = [
    validateModel,
    validateLastName,
    validateAddressLength,
    validatePhoneFormat,
    validateCountryAndState,
    // validateRuAddressLatin,
    validateUsMilitaryAddress,
    validateAddressUps,
    validateZipcode,
    clearFranceCoapplicantName
];

var validatorsOfWebsiteAddress = [
    validateFirstName,
    // validateLastName,
    validatePhoneFormat,
    validateEmail
];


function Address(context) {
    DAO.call(this, context);
}

util.inherits(Address, DAO);


Address.prototype.getDistributorBilling = function (distributorId, callback) {
    var options;

    options = {
        cache : {
            key : 'BillAddress_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_bill_address($1)',
        sqlParams: [distributorId]
    };

    this.queryDatabase(options, callback);
};

Address.prototype.getDistributorHome = function (distributorId, callback) {
    var options;

    options = {
        cache : {
            key : 'HomeAddress_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_home_address($1)',
        sqlParams: [distributorId]
    };

    this.queryDatabase(options, callback);
};

Address.prototype.getIsoAndSymbol = function (countryId, callback) {
    var options;

    options = {
        cache : {
            key : 'getIsoAndSymbol' + countryId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT c.iso,u.symbol from countries as c INNER JOIN currencies as u ON c.currency_id = u.id WHERE c.id =$1',
        sqlParams: [countryId]
    };

    this.queryDatabase(options, callback);
};

Address.prototype.getDistributorShipping = function (distributorId, callback) {
    var options;

    options = {
        cache : {
            key : 'ShipAddress_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_ship_address($1)',
        sqlParams: [distributorId]
    };

    this.queryDatabase(options, callback);
};

Address.prototype.getDistributorWebsite = function (distributorId, callback) {
    var options;

    options = {
        cache : {
            key : 'WebsiteAddress_' + distributorId,
            ttl : 60 * 60 * 2  // 2 hours
        },
        sqlStmt: 'SELECT * FROM mobile.get_website_address($1)',
        sqlParams: [distributorId]
    };

    this.queryDatabase(options, callback);
};


function fillCountryAndStateOfAddress(context, address, callback) {
    var logger = context.logger,
        countryDao = daos.createDao('Country', context);

    logger.debug("Filling country and state of address...");
    async.waterfall([
        function (callback) {
            if (address.country) {
                address.country_name = address.country.name;
                callback();
                return;
            }

            countryDao.getCountryById(address.country_id, function (error, country) {
                if (error) {
                    callback(error);
                    return;
                }

                address.country = country;
                address.country_name = country && country.name;
                callback();
                return;
            });
        },

        function (callback) {
            if (address.state) {
                address.state_name = address.state.name;
                callback();
                return;
            }

            countryDao.getStateById(address.state_id, function (error, state) {
                if (error) {
                    callback(error);
                    return;
                }

                address.state = state;
                address.state_name = state && state.name;
                callback();
                return;
            });
        },

        function (callback) {
            callback(null, address);
        }
    ], callback);
}


function validateAddress(address, validators, callback) {
    var self = this,
        context = this.context,
        logger = context.logger,
        allFailures = [],
        countryDao = daos.createDao('Country', this.context),
        addressFactory = this.models.Address;

    replaceQuotes(address);

    logger.debug("validating address data...");
    async.waterfall([
        // prepare. get country and state of address
        function (callback) {
            fillCountryAndStateOfAddress(context, address, callback);
        },

        // validate
        function (address, callback) {
            logger.debug("running validators...");
            async.forEachSeries(validators, function (eachValidator, callback) {
                eachValidator.call(self, address, function (error, failures) {
                    if (error) {
                        callback();
                        return;
                    }

                    if (failures && failures.length) {
                        allFailures = allFailures.concat(failures);
                    }
                    callback();
                });
            }, callback);
        }
    ], function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, allFailures);
    });
}

function createAddress(addressData, validators, callback) {
    var self = this,
        logger = this.context.logger,
        operator = utils.getAuditOperatorByContext(this.context),
        addressFactory = this.models.Address;

    logger.debug("creating address...");
    async.waterfall([
        function (callback) {
            validateAddress.call(self, addressData, validators, function (error, failures) {
                if (error) {
                    callback(error);
                    return;
                }

                if (failures && failures.length) {
                    error = new Error("Invalid address data.");
                    error.errorCode = 'InvalidAddress';
                    error.statusCode = 400;
                    error.data = {
                        failures : failures
                    };
                    callback(error);
                    return;
                }

                callback();
            });
        },

        // save to database
        function (callback) {
            logger.debug("Saving address data to database...");
            // can't has id property when creating
            delete addressData.id;

            if (!addressData.state_id) {
                delete addressData.state_id;
            }

            if (addressData.email) {
                addressData.email = addressData.email.toLowerCase();
            }

            addressFactory.create(addressData).success(function (address) {
                returnCreatedAddress(address, addressData);
                callback(null, address);
            }).error(callback);
        }
    ], callback);
};

function returnCreatedAddress(address, addressData) {
    address.country = addressData.country;
    address.country_name = addressData.country_name;
    address.state = addressData.state;
    address.state_name = addressData.state_name;
    return address;
};

Address.prototype.createHomeAddress = function (addressData, callback) {
    createAddress.call(this, addressData, validatorsOfHomeAddressWhenCreate, callback);
};

Address.prototype.validateHomeAddress = function (addressData, callback) {
    validateAddress.call(this, addressData, validatorsOfHomeAddress, callback);
};

Address.prototype.createUserShippingAddress = function (user, addressData, callback){
    var self = this,
        address,
	    logger = this.context.logger,
	    countryDao = daos.createDao('Country', this.context),
        usersShipAddressDao = daos.createDao('UsersShipAddress', this.context);

    async.waterfall([
        function (next) {
            countryDao.getCountryById(addressData.country_id, function (error, country) {
                if (error) {
                    callback(error);
                    return;
                }
                
                if (country){
                    addressData.country = country;  // fill country of addressData
                    logger.debug('createUserShippingAddress: country.iso = %s', country.iso);
                }
                
                next(null);
            });
        },
			 
        function (next){
            usersShipAddressDao.getSameShipAddress(user.id, addressData, function(error, result){
                if(error){
                    callback(error);
                    return;
                }

                if(result && result.rows[0]){
                    address = result.rows[0];					
                    returnCreatedAddress(address, addressData);
                    callback(null, address);
                    return;
                }

                next(null);
            });
        },

        function (next){
            createAddress.call(self, addressData, validatorsOfShippingAddress, next);
        }
    ], callback);
};

Address.prototype.createShippingAddress = function (addressData, callback) {
    createAddress.call(this, addressData, validatorsOfShippingAddress, callback);
};

Address.prototype.validateShippingAddress = function (addressData, callback) {
    validateAddress.call(this, addressData, validatorsOfShippingAddress, callback);
};

Address.prototype.createBillingAddress = function (addressData, callback) {
    createAddress.call(this, addressData, validatorsOfBillingAddress, callback);
};

Address.prototype.validateBillingAddress = function (addressData, callback) {
    validateAddress.call(this, addressData, validatorsOfBillingAddress, callback);
};

Address.prototype.createWebsiteAddress = function (addressData, callback) {
    createAddress.call(this, addressData, validatorsOfWebsiteAddress, callback);
};

Address.prototype.validateWebsiteAddress = function (addressData, callback) {
    validateAddress.call(this, addressData, validatorsOfWebsiteAddress, callback);
};


Address.prototype.getAddress = Address.prototype.getAddressInfo = Address.prototype.getAddressById = function (addressId, callback) {
    var self = this,
        context = this.context;

    async.waterfall([
        function (callback) {
            self.getById(addressId, callback);
        },

        function (address, callback) {
            fillCountryAndStateOfAddress(context, address, callback);
        }
    ], callback);
};


Address.prototype.getAddressesById = function (addressIds, callback) {
    var context = this.context,
        readModels = context.readModels;

    async.waterfall([
        function (callback) {
            readModels.Address.findAll({
                where : {
                    id : addressIds
                }
            }).done(callback);
        },

        function (addresses, callback) {
            async.mapSeries(addresses, function (address, callback) {
                fillCountryAndStateOfAddress(context, address, callback);
            }, callback);
        }
    ], callback);
};


Address.prototype.getCountryOfAddress = function (address, callback) {
    if (address.country) {
        callback(null, address.country);
        return;
    }

    var countryDao = daos.createDao('Country', this.context);
    countryDao.getCountryById(address.country_id, function (error, country) {
        if (error) {
            callback(error);
            return;
        }

        if (!country) {
            callback(null, null);
            return;
        }

        address.country = country;
        callback(null, country);
    });
};


Address.prototype.getStateOfAddress = function (address, callback) {
    if (address.state) {
        callback(null, address.state);
        return;
    }

    var countryDao = daos.createDao('Country', this.context);
    countryDao.getStateById(address.state_id, function (error, state) {
        if (error) {
            callback(error);
            return;
        }

        if (!state) {
            callback(null, null);
            return;
        }

        address.state = state;
        callback(null, state);
    });
};


Address.prototype.fillCountryAndStateOfAddress = function (address, callback) {
    fillCountryAndStateOfAddress(this.context, address, callback);
};

Address.ADDRESS_KEYS_TO_COMPARE = ['firstname', 'middleabbr', 'lastname', 'phone', 'address1', 'address2', 'city', 'zipcode', 'state_id', 'country_id'];

Address.prototype.isAddressEquals = function (address1, address2) {
    var addressKeysToCompare = Address.ADDRESS_KEYS_TO_COMPARE,
        key,
        i;

    if (address1 && address2) {
        for (i = 0; i < addressKeysToCompare.length; i += 1) {
            key = addressKeysToCompare[i];
            if (address1[key] !== address2[key]) {
                return false;
            }
        }
        return true;
    }

    return false;
};

/*
 *  options = {
 *      firstName : <String>, optional
 *      lastName : <String>, optional
 *      stateId: <Integer>, optional
 *      zipCodes: <String []>, optional
 *      city: <String>, optional
 *      roleCode: <String>, optional
 *  }
 */
Address.prototype.searchHomeAddress = function (options, callback) {
    var context = this.context,
        sqlStmt = '',
        whereConditions = [],
        sqlParams = [],
        queryDatabaseOptions;

    sqlStmt += ' SELECT a.*, d.id as distributor_id, u.login as login ';
    sqlStmt += ' FROM addresses a ';
    sqlStmt += ' INNER JOIN users_home_addresses uha ON uha.address_id = a.id ';
    sqlStmt += ' INNER JOIN distributors d ON d.user_id = uha.user_id ';
    sqlStmt += ' INNER JOIN users u ON u.id = uha.user_id ';

    whereConditions.push("uha.is_default = true");
    whereConditions.push("u.status_id = 1");

    if(u.isString(options.countryId)) {
        sqlParams.push(parseInt(options.countryId, 10));
        whereConditions.push("a.country_id = $" + sqlParams.length);
    }

    if(u.isString(options.city) && options.city.length > 0){
        sqlParams.push(options.city + '%');
        whereConditions.push("a.city ILIKE $" + sqlParams.length);
    } else if(u.isArray(options.zipCodes) && options.zipCodes.length > 0){
        whereConditions.push(" a.zipcode IN ('" + options.zipCodes.join("','")+"') ");
    } else if(u.isNumber(options.stateId)){
        sqlParams.push(options.stateId);
        whereConditions.push("a.state_id = $" + sqlParams.length);
    }

    if (options.firstName) {
        sqlParams.push(options.firstName + '%');
        whereConditions.push("a.firstname ilike $" + sqlParams.length);
    }

    if (options.lastName) {
        sqlParams.push(options.lastName + '%');
        whereConditions.push("a.lastname ilike $" + sqlParams.length);
    }

    if(context.companyCode === 'MMD'){
        whereConditions.push("d.next_renewal_date > now() ");
        whereConditions.push("d.special_distributor_next_renewal_date > now() ");
    }

    if(options.roleCode){
        sqlStmt += " INNER JOIN roles_users ru ON ru.user_id = u.id ";
        sqlStmt += " INNER JOIN roles r ON ru.role_id = r.id ";
        sqlParams.push(options.roleCode);
        whereConditions.push("r.role_code = $" + sqlParams.length);
    }

    sqlStmt += " WHERE " + whereConditions.join(' AND ');

    queryDatabaseOptions = {
        sqlStmt : sqlStmt,
        sqlParams : sqlParams
    };

    DAO.queryDatabase(context, queryDatabaseOptions, function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, result.rows);
    });

};


module.exports = Address;

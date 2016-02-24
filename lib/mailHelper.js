/**
 * mail helper
 */

var async = require('async');
var moment = require('moment');
var daos = require('../daos');
var mailService = require('./mailService');


function getDistributorRegistrationUserEmailData(context, distributor, callback) {
    var logger = context.logger,
        userDao = daos.createDao('User', context),
        distributorDao = daos.createDao('Distributor', context),
        userOfSponsor,
        mailData = {};

    logger.debug("Preparing distributor registration user email data...");

    mailData['email-subject'] = 'Registration Notice';
    async.waterfall([
        function (callback) {
            userDao.getById(distributor.user_id, callback);
        },

        function (user, callback) {
            mailData['recipient-email'] = user.email;

            mailData.distributor = {};
            mailData.distributor['login-name'] = user.login;
            mailData.distributor['registration-time'] = user.entry_date;

            userDao.getHomeAddressOfUser(user, callback);
        },

        function (address, next) {
            mailData.distributor.id = distributor.id;
            mailData.distributor['first-name'] = address.firstname;
            mailData.distributor['last-name'] = address.lastname;

            if (!distributor.personal_sponsor_distributor_id) {
                callback(null, mailData);
                return;
            }

            distributorDao.getById(distributor.personal_sponsor_distributor_id, next);
        },

        function (sponsor, callback) {
            userDao.getById(sponsor.user_id, callback);
        },

        function (result, callback) {
            userOfSponsor = result;
            userDao.getHomeAddressOfUser(userOfSponsor, callback);
        },

        function (addressOfSponsor, callback) {
            mailData.sponsor = {
                id : distributor.personal_sponsor_distributor_id,
                email : userOfSponsor.email,
                'first-name' : addressOfSponsor.firstname,
                'last-name' : addressOfSponsor.lastname,
                phone : addressOfSponsor.phone
            };

            callback(null, mailData);
        }

    ], callback);
}


function sendDistributorRegistrationUserEmail(context, distributor, callback) {
    var logger = context.logger;

    logger.debug("Sending distributor registration user email...");
    async.waterfall([
        function (callback) {
            getDistributorRegistrationUserEmailData(context, distributor, callback);
        },

        function (mailData, callback) {
            mailService.sendMail(context, 'registrations/distributors', mailData, function (error) {
                if (error) {
                    logger.error("Failed to send distributor registration user email: %s", error.message);
                }
                callback();
            });
        }
    ], callback);
}


function getRetailCustomerRegistrationUserEmailData(context, distributor, callback) {
    var logger = context.logger,
        userDao = daos.createDao('User', context),
        distributorDao = daos.createDao('Distributor', context),
        userOfSponsor,
        mailData = {};

    logger.debug("Preparing retail customer registration user email data...");

    mailData['email-subject'] = 'Registration Notice';
    async.waterfall([
        function (callback) {
            userDao.getById(distributor.user_id, callback);
        },

        function (user, callback) {

            mailData['recipient-email'] = user.email;
            mailData['retail-customer'] = {};
            mailData['retail-customer'].id= distributor.id;
            mailData['retail-customer']['login-name'] = user.login;

            userDao.getHomeAddressOfUser(user, callback);
        },

        function (address, next) {
           
            mailData['retail-customer']['first-name'] = address.firstname;
            mailData['retail-customer']['last-name'] = address.lastname;
            if (!distributor.personal_sponsor_distributor_id) {
                callback(null, mailData);
                return;
            }

            distributorDao.getById(distributor.personal_sponsor_distributor_id, next);
        },

        function (sponsor, callback) {
            userDao.getById(sponsor.user_id, callback);
        },

        function (result, callback) {
            userOfSponsor = result;
            userDao.getHomeAddressOfUser(userOfSponsor, callback);
        },

        function (addressOfSponsor, callback) {
            mailData.sponsor = {
                id : distributor.personal_sponsor_distributor_id,
                email : userOfSponsor.email,
                'first-name' : addressOfSponsor.firstname,
                'last-name' : addressOfSponsor.lastname,
                phone : addressOfSponsor.phone
            };

            callback(null, mailData);
        }

    ], callback);
}


function sendRetailCustomerRegistrationUserEmail(context, distributor, callback) {
    var logger = context.logger;

    logger.debug("Sending retail customer registration user email...");
    async.waterfall([
        function (callback) {
            getRetailCustomerRegistrationUserEmailData(context, distributor, callback);
        },

        function (mailData, callback) {
            mailService.sendMail(context, 'registrations/retail-customers', mailData, function (error) {
                if (error) {
                    logger.error("Failed to send retail customer registration user email: %s", error.message);
                }
                callback();
            });
        }
    ], callback);
}


function getRegistrationSponsorEmailData(context, distributor, type, callback) {
    var logger = context.logger,
        userDao = daos.createDao('User', context),
        distributorDao = daos.createDao('Distributor', context),
        user,
        mailData = {};

    logger.debug("Preparing registration sponsor email data...");


    mailData['email-subject'] = 'New Registration Notice';

    async.waterfall([
        function (callback) {
            userDao.getById(distributor.user_id, callback);
        },

        function (result, callback) {
            user = result;
            userDao.getHomeAddressOfUser(user, callback);
        },

        function (address, next) {
            mailData.distributor = {
                id : distributor.id,
                'entry-date' : moment(user.entry_date).format('YYYY-MM-DD'),
                'first-name' : address.firstname,
                'last-name' : address.lastname,
		phone : address.phone,
		email : user.email
            };

            if (!distributor.personal_sponsor_distributor_id) {
                callback(null, mailData);
                return;
            }

            distributorDao.getById(distributor.personal_sponsor_distributor_id, next);
        },

        function (sponsor, callback) {
            userDao.getById(sponsor.user_id, callback);
        },

        function (userOfSponsor, callback) {
            mailData['recipient-email'] = userOfSponsor.email;

            userDao.getHomeAddressOfUser(userOfSponsor, callback);
        },

        function (addressOfSponsor, callback) {
            mailData.sponsor = {
                'first-name' : addressOfSponsor.firstname,
                'last-name' : addressOfSponsor.lastname,
                phone : addressOfSponsor.phone
            };

            callback(null, mailData);
        }

    ], callback);
}

function sendRegistrationSponsorEmail(apiURL, context, distributor, type, callback) {
    if (!distributor.personal_sponsor_distributor_id) {
        callback();
        return;
    }

    var logger = context.logger;

    logger.debug("Sending registration sponsor email...");
    async.waterfall([
        function (callback) {
            getRegistrationSponsorEmailData(context, distributor, type, callback);
        },

        function (mailData, callback) {
            mailService.sendMail(context, apiURL, mailData, function (error) {
                if (error) {
                    logger.error("Failed to send registration sponsor email: %s", error.message);
                }
                callback();
            });
        }
    ], callback);
}

function sendDistributorRegistrationEmail(context, distributor, callback) {
    async.waterfall([
        function (callback) {
            sendDistributorRegistrationUserEmail(context, distributor, callback);
        },

        function (callback) {
            sendRegistrationSponsorEmail('registrations/distributors/sponsors', context, distributor, 'distributor', callback);
        }
    ], callback);
}


function sendRetailCustomerRegistrationEmail(context, distributor, callback) {
    async.waterfall([
        function (callback) {
            sendRetailCustomerRegistrationUserEmail(context, distributor, callback);
        },

        function (callback) {
            sendRegistrationSponsorEmail('registrations/retail-customers/sponsors', context, distributor, 'customer', callback);
        }
    ], callback);
}

function sendResetPasswordTokenEmail(options, callback){
    var context = options.context,
        logger = context.logger,
        config = context.config || {},
        application = config.application || {},
        resetPasswordURLTmp = application.resetPasswordURLTemplate || '/reset-password?token={TOKEN}',
        login = options.login,
        token = options.token,
        email = options.email;

        var mailData = {
            "email-subject":  'Reset Your Password',
            "recipient-email":  email,
            'login': login,
            'reset-password-url': resetPasswordURLTmp.replace('{TOKEN}', token)
        };


        logger.debug("reset password:%j", mailData);

        mailService.sendMail(context, 'reset-password', mailData, function (error) {
            if (error) {
                logger.error("Failed to send resetting password: %s from:%s", error.message, email);
            }
            callback(null);
        });
}

exports.sendDistributorRegistrationEmail = sendDistributorRegistrationEmail;
exports.sendRetailCustomerRegistrationEmail = sendRetailCustomerRegistrationEmail;
exports.sendResetPasswordTokenEmail = sendResetPasswordTokenEmail;

/*global describe, it */
/*jshint expr:true */

var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');
var util = require('util');
var random = require('../../../lib/random');

var sutPath = '../../../daos/Distributor.js';
var DistributorDao = require(sutPath);


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        database : true,
        user : true
    }, callback);
}


describe('daos/Distributor', function () {
    // describe('registerDistributor()', function () {
    //     it('distributor not in roles of config.application.rolesCanSponsorOthers can not be unilevel sponsor of others', function (done) {
    //         var context,
    //             distributorDao,
    //             tick = (new Date()).getTime(),
    //             sponsorId = 1007401,
    //             registerOptions = {
    //                 sponsor : sponsorId,
    //                 roleCode : 'D',
    //                 login : 'test-' + tick,
    //                 password : 'password',
    //                 email : 'test-' + tick + '@test.com',
    //                 birthday : new Date(),
    //                 socialSecurityNumber : random.text(9, random.seedNumbers),
    //                 taxnumber : 'tax-' + tick,
    //                 countryIso : 'US'
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 context.config.application.rolesCanSponsorOthers = [];
    //                 distributorDao = new DistributorDao(context);
    //                 distributorDao.registerDistributor(registerOptions, function (error, savedDistributor) {
    //                     expect(error.errorCode).to.equal('InvalidSponsor');

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });
    // });

    // describe('setDualteamSettings()', function () {
    //     it('should work', function (done) {
    //         var context,
    //             distributorDao,
    //             tick = (new Date()).getTime(),
    //             sponsorId = 1007401,
    //             registerOptions = {
    //                 sponsor : sponsorId,
    //                 roleCode : 'D',
    //                 login : 'test-' + tick,
    //                 password : 'password',
    //                 email : 'test-' + tick + '@test.com',
    //                 birthday : new Date(),
    //                 socialSecurityNumber : random.text(9, random.seedNumbers),
    //                 taxnumber : 'tax-' + tick,
    //                 countryIso : 'US'
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 distributorDao = new DistributorDao(context);
    //                 distributorDao.registerDistributor(registerOptions, callback);
    //             },

    //             function (newDistributor, callback) {
    //                 distributorDao.setDualteamSettings(newDistributor, {}, callback);
    //             },

    //             function (savedDistributor, callback) {
    //                 expect(savedDistributor.dualteam_sponsor_distributor_id).to.be.ok;
    //                 expect(savedDistributor.dualteam_current_position).to.be.ok;
    //                 callback();
    //             }
    //         ], done);
    //     });

    //     it('distributor not in roles of config.application.rolesCanSponsorOthers can not be dualteam sponsor of others', function (done) {
    //         var context,
    //             distributorDao,
    //             tick = (new Date()).getTime(),
    //             sponsorId = 1007401,
    //             registerOptions = {
    //                 sponsor : sponsorId,
    //                 roleCode : 'D',
    //                 login : 'test-' + tick,
    //                 password : 'password',
    //                 email : 'test-' + tick + '@test.com',
    //                 birthday : new Date(),
    //                 socialSecurityNumber : random.text(9, random.seedNumbers),
    //                 taxnumber : 'tax-' + tick,
    //                 countryIso : 'US'
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 distributorDao = new DistributorDao(context);
    //                 distributorDao.registerDistributor(registerOptions, callback);
    //             },

    //             function (newDistributor, callback) {
    //                 context.config.application.rolesCanSponsorOthers = [];

    //                 distributorDao.setDualteamSettings(newDistributor, {
    //                     dualteamSponsorId : context.user.distributorId
    //                 }, function (error, savedDistributor) {
    //                     expect(error.errorCode).to.equal('InvalidDualteamSponsorId');

    //                     callback();
    //                 });
    //             }
    //         ], done);
    //     });

    //     it('distributor not in roles of config.application.rolesHaveDualteamPosition can not have dualteam position', function (done) {
    //         var context,
    //             distributorDao,
    //             tick = (new Date()).getTime(),
    //             sponsorId = 1007401,
    //             registerOptions = {
    //                 sponsor : sponsorId,
    //                 roleCode : 'D',
    //                 login : 'test-' + tick,
    //                 password : 'password',
    //                 email : 'test-' + tick + '@test.com',
    //                 birthday : new Date(),
    //                 socialSecurityNumber : random.text(9, random.seedNumbers),
    //                 taxnumber : 'tax-' + tick,
    //                 countryIso : 'US'
    //             };

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 distributorDao = new DistributorDao(context);
    //                 distributorDao.registerDistributor(registerOptions, callback);
    //             },

    //             function (newDistributor, callback) {
    //                 context.config.application.rolesHaveDualteamPosition = [];

    //                 distributorDao.setDualteamSettings(newDistributor, {}, callback);
    //             },

    //             function (savedDistributor, callback) {
    //                 expect(savedDistributor.dualteam_sponsor_distributor_id).to.be.not.ok;
    //                 expect(savedDistributor.dualteam_current_position).to.be.not.ok;
    //                 callback();
    //             }
    //         ], done);
    //     });
    // });

    // describe('canSponsorOthers()', function () {
    //     it('user with role in config.application.rolesCanSponsorOthers can sponsor others', function (done) {
    //         var context,
    //             distributorDao;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 distributorDao = new DistributorDao(context);
    //                 distributorDao.getById(context.user.distributorId, callback);
    //             },

    //             function (distributor, callback) {
    //                 context.config.application.rolesCanSponsorOthers = ['D'];
    //                 distributorDao.canSponsorOthers(distributor, callback);
    //             },

    //             function (can, callback) {
    //                 expect(can).to.be.true;

    //                 callback();
    //             }
    //         ], done);
    //     });

    //     it('user with role not in config.application.rolesCanSponsorOthers can not sponsor others', function (done) {
    //         var context,
    //             distributorDao;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 distributorDao = new DistributorDao(context);
    //                 distributorDao.getById(context.user.distributorId, callback);
    //             },

    //             function (distributor, callback) {
    //                 context.config.application.rolesCanSponsorOthers = [];
    //                 distributorDao.canSponsorOthers(distributor, callback);
    //             },

    //             function (can, callback) {
    //                 expect(can).to.be.false;

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });

    // describe('updateLifeTimeRank()', function () {
    //     it('update the distributor lifetime_rank cloumn value', function (done) {
    //         var context,
    //             distributorDao;

    //         async.waterfall([
    //             getContext,

    //             function (result, callback) {
    //                 context = result;

    //                 distributorDao = new DistributorDao(context);
    //                 distributorDao.updateLifeTimeRank(context.user.distributorId, 40, callback);
    //             },

    //             function (distributor, callback) {
    //                 distributorDao.getById(context.user.distributorId, callback);
    //             },

    //             function (distributor, callback) {
    //                 expect(distributor.lifetime_rank).to.equal(40);

    //                 callback();
    //             }
    //         ], done);
    //     });
    // });

    describe('getDistributorBySSN', function () {
        it('getDistributorBySSN', function (done) {

            async.waterfall([
                function (callback) {
                    getContext(callback);
                },

                function (context, callback) {
                    var distributorDao = new DistributorDao(context);
                    distributorDao.getDistributorBySSN('480725591', callback);
                }
            ], function(error, result) {
                if(error) {
                    done(error);
                    return;
                }

                if(result) {
                    expect(result).to.have.property('id');
                    expect(result).to.have.property('social_security_number', '480725591');
                    expect(result).to.have.property('company');
                    expect(result).to.have.property('user_id');
                    expect(result).to.have.property('date_of_birth');
                }
                else {
                    expect(result).to.be.undefined;
                }

                done();
            });
        });

    });

    describe('updateNextRenewalDateOfDistributor()', function () {
        it('update the distributor next renewal date', function (done) {
            var distributorDao;
            var distributor;
            var now = new Date();
            var nowYear = now.getFullYear();
            var nowMonth = now.getMonth();
            var nowDay = now.getDate();
            var context;
            var nextRenewalDate = new Date(nowYear, nowMonth + 1, nowDay);
            var SpecialDistributorNextRenewalDate = new Date(nowYear, nowMonth + 1, nowDay);

            async.waterfall([

                function (callback) {
                    getContext(callback);
                },

                function (tempContext, callback) {
                    context = tempContext;
                    distributorDao = new DistributorDao(context);
                    distributorDao.getDistributorByUserId(context.user.userId, callback);
                },

                function (distributor, callback) {
                    distributorDao.updateNextRenewalDateOfDistributor({
                        distributor: distributor,
                        nextRenewalDate: nextRenewalDate,
                        SpecialDistributorNextRenewalDate: SpecialDistributorNextRenewalDate
                    }, callback);
                },

                function (callback) {
                    distributorDao.getDistributorByUserId(context.user.userId, callback);
                }

            ], function (error, distributor) {
                if(error) {
                    done(error);
                    return;
                }

                expect(distributor.next_renewal_date.getTime()).to.be.equal(nextRenewalDate.getTime());
                expect(distributor.special_distributor_next_renewal_date.getTime()).to.be.equal(SpecialDistributorNextRenewalDate.getTime());
                done();
            });

        });
    });

    describe('isRenewalDueByDistributor()', function () {
        it('is renewal due by distributor', function (done) {
            var distributorDao;
            var distributor;
            var context;

            async.waterfall([

                function (callback) {
                    getContext(callback);
                },

                function (tempContext, callback) {
                    context = tempContext;
                    // context.companyCode = 'MMD';
                    distributorDao = new DistributorDao(context);
                    distributorDao.getDistributorByUserId(context.user.userId, callback);
                },

                function (distributor, callback) {
                    distributorDao.isRenewalDueByDistributor({
                        context: context,
                        distributor: distributor
                    }, callback);
                }
            ], function (error, isRenwalDue) {
                if(error) {
                    done(error);
                    return;
                }

                expect(isRenwalDue).to.be.false;
                done();
            });

        });
    });


    describe('getRoleCodeOfDistrbutor()', function () {
        it('should work.', function (done) {
            async.waterfall([

                function (callback) {
                    getContext(callback);
                },

                function (context, callback) {
                    var distributorDao = new DistributorDao(context);
                    distributorDao.getRoleCodeOfDistrbutor({
                        distributor_id: context.user.distributorId
                    }, callback);
                }
            ], function (error, roleCode) {
                if(error) {
                    if(error.statusCode) {
                        done();
                    }
                    else {
                        done(error);
                    }
                }

                expect(roleCode).to.exist;
                done();
            });
        });
    });


    describe('resetRenewalDateOfDistributor()', function () {
        it('should work.', function (done) {
            var options = {
                    distributor: {},
                    nextRenewalDate: new Date(),
                    updateFieldArray: []
                };

            async.waterfall([

                function (callback) {
                    getContext(callback);
                },

                function (context, callback) {
                    options.distributor.id = context.user.distributorId;
                    context.companyCode = 'MMD';
                    var distributorDao = new DistributorDao(context);
                    distributorDao.resetRenewalDateOfDistributor(options, callback);
                }
            ], function (error) {
                if(error) {
                    if(error.statusCode) {
                        done();
                    }
                    else {
                        done(error);
                    }
                }

                expect(['special_distributor_next_renewal_date', 'next_renewal_date'])
                    .to.include.members(options.updateFieldArray);

                if(options.distributor.next_renewal_date) {
                    expect(['next_renewal_date']).to.include.members(options.updateFieldArray);
                    expect(options.distributor.next_renewal_date).equal(options.nextRenewalDate);
                }
                if(options.distributor.special_distributor_next_renewal_date) {
                    expect(['special_distributor_next_renewal_date']).to.include.members(options.updateFieldArray);
                    expect(options.distributor.special_distributor_next_renewal_date).equal(options.nextRenewalDate);
                }
                done();
            });
        });
    });

    describe('getTaxNumberOfDistributor', function () {

        it('should work.', function (done) {

            async.waterfall([
                getContext,

                function (context, callback) {
                    var distributor = {
                        company: null,
                        social_security_number: 10000,
                        taxnumber_exemption: 9999
                    };
                    context.companyCode = 'MMD';
                    var distributorDao = new DistributorDao(context);
                    var ssnOrTaxNumber = distributorDao.getTaxNumberOfDistributor({distributor: distributor});
                    callback(null, ssnOrTaxNumber);
                }

            ], function (error, ssnOrTaxNumber) {
                if(error){
                    done(error);
                }

                expect(ssnOrTaxNumber).to.equal(10000);
                done();
            });
        });

        it('should work.', function (done) {

            async.waterfall([
                getContext,

                function (context, callback) {
                    var distributor = {
                        company: 'mmd',
                        social_security_number: 10000,
                        taxnumber_exemption: 9999
                    };
                    context.companyCode = 'MMD';
                    var distributorDao = new DistributorDao(context);
                    var ssnOrTaxNumber = distributorDao.getTaxNumberOfDistributor({distributor: distributor});
                    callback(null, ssnOrTaxNumber);
                }

            ], function (error, ssnOrTaxNumber) {
                if(error){
                    done(error);
                }

                expect(ssnOrTaxNumber).to.equal(9999);
                done();
            });
        });

    });

<<<<<<< HEAD

    describe('_isRenewalDue', function () {
        it('should work.', function(done) {
            async.waterfall([

                function (callback) {
                    getContext(callback);
                }

            ], function (error, context) {
                context.companyCode = 'MMD';
                var distributorDao = new DistributorDao(context);
                var options = {
                    nextRenewalDate: new Date(2014, 11, 12, 0, 0, 0),
                    nextSpecialDistributorRenewalDate: new Date(2014, 11, 12, 0, 0, 0)
                };

                expect(distributorDao._isRenewalDue(options)).to.be.true;

                options = {
                    nextRenewalDate: null,
                    nextSpecialDistributorRenewalDate: new Date()
                };

                expect(distributorDao._isRenewalDue(options)).to.be.true;

                options = {
                    nextRenewalDate: new Date(2018, 11, 12),
                    nextSpecialDistributorRenewalDate: new Date(2018, 11, 12)
                };

                expect(distributorDao._isRenewalDue(options)).to.be.false;

                done(null);
            });
        });
    });

});


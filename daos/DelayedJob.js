/**
 * DelayedJob DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function DelayedJob(context) {
    DAO.call(this, context);
}

util.inherits(DelayedJob, DAO);


DelayedJob.prototype.createDelayedJob = function (delayedJob, callback) {
    this.models.DelayedJob.create(delayedJob).success(function (newDelayedJob) {
        callback(null, newDelayedJob);
    }).error(callback);
};

module.exports = DelayedJob;

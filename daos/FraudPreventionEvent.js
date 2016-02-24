/**
 * FraudPreventionEvent DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function FraudPreventionEvent(context) {
    DAO.call(this, context);
}

util.inherits(FraudPreventionEvent, DAO);


FraudPreventionEvent.prototype.createFraudPreventionEvent = function (fraudPreventionEvent, callback) {
    this.models.FraudPreventionEvent.create(fraudPreventionEvent).success(function (newFraudPreventionEvent) {
        callback(null, newFraudPreventionEvent);
    }).error(callback);
};

module.exports = FraudPreventionEvent;

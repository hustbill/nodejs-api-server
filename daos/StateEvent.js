/**
 * StateEvent DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function StateEvent(context) {
    DAO.call(this, context);
}

util.inherits(StateEvent, DAO);


StateEvent.prototype.createStateEvent = function (stateEvent, callback) {
    this.models.StateEvent.create(stateEvent).success(function (newStateEvent) {
        callback(null, newStateEvent);
    }).error(callback);
};

module.exports = StateEvent;

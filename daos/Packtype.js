/**
 * Packtype DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function Packtype(context) {
    DAO.call(this, context);
}

util.inherits(Packtype, DAO);


module.exports = Packtype;

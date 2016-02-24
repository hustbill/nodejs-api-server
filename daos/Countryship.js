/**
 * Countryship DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function Countryship(context) {
    DAO.call(this, context);
}

util.inherits(Countryship, DAO);


Countryship.prototype.canShip = function (countryId, destinationCountryId, callback) {
    var Countryship = this.readModels.Countryship;

    Countryship.find({
        where : {
            country_id : countryId,
            destination_country_id : destinationCountryId
        }
    }).success(function (countryship) {
        callback(null, !!countryship);
    }).error(callback);
};

Countryship.prototype.getCountryIdsCanShipTo = function (countryId, callback) {
    var Countryship = this.readModels.Countryship;

    Countryship.findAll({
        where : {
            country_id : countryId
        }
    }).success(function (countryships) {
        var countryIds = countryships.map(function (countryship) {
            return countryship.destination_country_id;
        });
        callback(null, countryIds);
    }).error(callback);
};

module.exports = Countryship;

/**
 * Taxon DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');

function Taxon(context) {
    DAO.call(this, context);
}

util.inherits(Taxon, DAO);


Taxon.prototype.getTaxonByName = function (taxonName, callback) {
    this.readModels.Taxon.find({
        where : {
            name : taxonName
        }
    }).done(callback);
};


function fillPropertiesToTaxons(context, taxons, callback) {
    if (!taxons || !taxons.length) {
        callback();
        return;
    }

    var taxonsMap = {},
        taxonIds = taxons.map(function (taxon) {
            return taxon.id;
        });

    taxons.forEach(function (taxon) {
        taxonsMap[taxon.id] = taxon;
    });

    async.waterfall([
        function (callback) {
            var queryDatabaseOptions = {
                sqlStmt : "select tpr.taxon_id, pr.id, pr.name, pr.presentation, tpr.value from taxon_properties tpr inner join properties pr on pr.id = tpr.property_id where tpr.taxon_id in (" + taxonIds.join(',') + ")",
                sqlParams : []
            };

            DAO.queryDatabase(context, queryDatabaseOptions, callback);
        },

        function (result, callback) {
            var rows = result.rows;

            rows.forEach(function (property) {
                var taxon = taxonsMap[property.taxon_id];
                if (taxon) {
                    if (!taxon.properties) {
                        taxon.properties = {};
                    }
                    taxon.properties[property.name] = {
                        presentation: property.presentation,
                        value: property.value
                    };
                }
            });

            callback();
        }
    ], callback);
}


Taxon.prototype.getTaxonTree = function (callback) {
    var context = this.context;

    async.waterfall([
        function (callback) {
            context.readModels.Taxon.findAll().done(callback);
        },

        function (taxons, callback) {
            fillPropertiesToTaxons(context, taxons, function (error) {
                callback(error, taxons);
            });
        },

        function (taxons, callback) {
            taxons.forEach(function (parentTaxon) {
                if (parentTaxon.active === false) {
                    return;
                }

                parentTaxon.subTaxons = [];

                taxons.forEach(function (subTaxon) {
                    if (subTaxon.active === false) {
                        return;
                    }

                    if (subTaxon.parent_id === parentTaxon.id) {
                        parentTaxon.subTaxons.push(subTaxon);
                    }
                });
            });

            var topTaxons = [];
            taxons.forEach(function (taxon) {
                if (taxon.active === false) {
                    return;
                }

                if (!taxon.parent_id) {
                    topTaxons.push(taxon);
                }
            });

            callback(null, topTaxons);
        }
    ], callback);
};


Taxon.prototype.getTaxonDetailById = function (taxonId, callback) {
    var context = this.context;

    async.waterfall([
        function (callback) {
            context.readModels.Taxon.findAll({
                order: 'position'
            }).done(callback);
        },

        function (taxons, callback) {
            fillPropertiesToTaxons(context, taxons, function (error) {
                callback(error, taxons);
            });
        },

        function (taxons, callback) {
            taxons.forEach(function (parentTaxon) {
                parentTaxon.subTaxons = [];
                parentTaxon.subTaxonIds = [];

                taxons.forEach(function (subTaxon) {
                    if (subTaxon.parent_id === parentTaxon.id) {
                        parentTaxon.subTaxons.push(subTaxon);
                        parentTaxon.subTaxonIds.push(subTaxon.id);
                    }
                });

            });

            var taxon,
                i;
            for (i = 0; i < taxons.length; i += 1) {
                taxon = taxons[i];
                if (taxon.id === taxonId) {
                    callback(null, taxon);
                    return;
                }
            }

            callback(null, null);
        }
    ], callback);
};

module.exports = Taxon;

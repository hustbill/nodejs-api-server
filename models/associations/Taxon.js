/**
 * Associations for Taxon table.
 */
module.exports = function (sequelize, models) {
    var Taxon = models.Taxon,
        Product = models.Product;

    Taxon.hasMany(
        Product,
        {
            joinTableName : 'products_taxons',
            foreignKey : 'taxon_id'
        }
    );
};

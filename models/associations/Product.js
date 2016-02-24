/**
 * Associations for Product table.
 */
module.exports = function (sequelize, models) {
    var Product = models.Product,
        Country = models.Country,
        Taxon = models.Taxon;

    Product.hasMany(
        Country,
        {
            joinTableName : 'countries_products',
            foreignKey : 'product_id'
        }
    );

    Product.hasMany(
        Taxon,
        {
            joinTableName : 'products_taxons',
            foreignKey : 'product_id'
        }
    );
};

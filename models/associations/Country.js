/**
 * Associations for Country table
 */
module.exports = function (sequelize, models) {
    var Country = models.Country,
        Currency = models.Currency,
        Product = models.Product;

    Country.hasOne(Currency, {
        foreignKey : 'currency_id'
    });

    Country.hasMany(
        Product,
        {
            joinTableName : 'countries_products'
        }
    );

    // TODO: Add continent association here

};

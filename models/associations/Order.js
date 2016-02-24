/**
 * Associations for Country table
 */
module.exports = function (sequelize, models) {
    var Country = models.Country,
        Currency = models.Currency;

    Country.hasOne(Currency, {
        foreignKey : 'currency_id'
    });

    // TODO: Add continent association here

};

/**
 * Associations for State table.
 */
module.exports = function (sequelize, models) {
    var Country = models.Country,
        State = models.State;

    State.belongsTo(
        Country,
        {
            as : 'Country',
            foreignKey : 'country_id'
        }
    );

    Country.hasMany(
        State,
        {
            foreignKey : 'country_id'
        }
    );
};



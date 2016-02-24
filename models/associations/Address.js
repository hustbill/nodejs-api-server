/**
 * Associations for Address table.
 */
module.exports = function (sequelize, models) {
    var Address = models.Address,
        Country = models.Country,
        State = models.State;

    Address.belongsTo(
        Country,
        {
            as : 'Country',
            foreignKey : 'country_id'
        }
    );

    Country.hasMany(
        Address,
        {
            foreignKey : 'country_id'
        }
    );

    Address.belongsTo(
        State,
        {
            as : 'State',
            foreignKey : 'state_id'
        }
    );

    State.hasMany(
        Address,
        {
            foreignKey : 'state_id'
        }
    );
};


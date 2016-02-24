/**
 * Associations for Address table.
*/
module.exports = function (sequelize, models) {
    var Address = models.Address,
        User = models.User,
        UsersShipAddress = models.UsersShipAddress;

    UsersShipAddress.belongsTo(
        Address,
        {
            as : 'Address',
            foreignKey : 'address_id'
        }
    );

    Address.hasMany(
        UsersShipAddress,
        {
            foreignKey : 'address_id'
        }
    );

    Address.belongsTo(
        User,
        {
            as : 'User',
            foreignKey : 'user_id'
        }
    );

    User.hasMany(
        UsersShipAddress,
        {
            foreignKey : 'user_id'
        }
    );
};


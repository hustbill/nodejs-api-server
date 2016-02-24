/**
 * Associations for User table.
 */
module.exports = function (sequelize, models) {
    var User = models.User,
        Address = models.Address,
        Role = models.Role;

    User.hasMany(
        Role,
        {
            joinTableName : 'roles_users',
            foreignKey : 'user_id'
        }
    );
};

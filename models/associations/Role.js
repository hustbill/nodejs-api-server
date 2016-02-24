/**
 * Associations for Role table.
 */
module.exports = function (sequelize, models) {
    var Role = models.Role,
        Product = models.Product;

    Role.hasMany(
        Product,
        {
            joinTableName : 'roles_users',
            foreignKey : 'role_id'
        }
    );
};

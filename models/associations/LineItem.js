/**
 * Associations for line_items table
 */
module.exports = function (sequelize, models) {
    var LineItem = models.LineItem,
        Order = models.Order;

    LineItem.belongsTo(Order);

    // TODO: Add continent association here

};

/**
 * Associations for TaxRate table.
 */
module.exports = function (sequelize, models) {
    var TaxRate = models.TaxRate,
        TaxCategory = models.TaxCategory;

    TaxRate.belongsTo(
        TaxCategory,
        {
            as : 'TaxCategory',
            foreignKey : 'tax_category_id'
        }
    );
};


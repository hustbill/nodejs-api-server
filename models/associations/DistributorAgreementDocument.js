/**
 * Associations for Country table
 */
module.exports = function (sequelize, models) {
    var Country = models.Country,
        DistributorAgreementDocument = models.DistributorAgreementDocument;

    DistributorAgreementDocument.hasOne(Country, {
        foreignKey : 'country_id'
    });


};

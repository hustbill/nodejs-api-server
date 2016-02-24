/**
 * distributor_agreement_documents table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('distributor_agreement_document', {
        locale:  DataTypes.STRING,
        content:  DataTypes.TEXT
    });
};

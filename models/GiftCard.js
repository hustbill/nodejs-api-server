/**
 * gift_cards table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('gift_card', {
        active:  DataTypes.BOOLEAN,
        code:  DataTypes.STRING,
        email_message:  DataTypes.TEXT,
        user_id:  DataTypes.INTEGER,
        recipient_email:  DataTypes.STRING,
        variant_id:  DataTypes.INTEGER,
        description:  DataTypes.STRING,
        total:  DataTypes.FLOAT,
        balance:  DataTypes.FLOAT,
        pin:  DataTypes.STRING,
        mailing_address_id:  DataTypes.INTEGER,
        mailing_message:  DataTypes.TEXT,
        name_to:  DataTypes.STRING,
        name_from:  DataTypes.STRING,
        order_id:  DataTypes.INTEGER,
        expire_at:  DataTypes.DATE
    });
};

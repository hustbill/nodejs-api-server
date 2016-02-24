/**
 * distributors table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('distributor', {
        company:  DataTypes.STRING,
        taxnumber:  DataTypes.STRING,
        personal_sponsor_distributor_id:  DataTypes.INTEGER,
        dualteam_sponsor_distributor_id:  DataTypes.INTEGER,
        dualteam_current_position:  DataTypes.STRING,
        dualteam_placement:  DataTypes.STRING,
        lifetime_rank:  DataTypes.INTEGER,
        accept_tc_at:  DataTypes.DATE,
        unconditional_rank:  DataTypes.INTEGER,
        conditional_rank:  DataTypes.INTEGER,
        commission_payment_method:  DataTypes.STRING,
        user_id:  DataTypes.INTEGER,
        taxnumber_exemption:  DataTypes.STRING,
        date_of_birth:  DataTypes.DATE,
        social_security_number:  DataTypes.STRING,
        next_renewal_date:  DataTypes.DATE,
        packtype_id:  DataTypes.INTEGER,
        lifetime_packtype_id:  DataTypes.INTEGER,
        customer_id: DataTypes.STRING,
        special_distributor_next_renewal_date: DataTypes.DATE
    });
};

/**
 * coupons table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('coupon', {
        active : DataTypes.BOOLEAN,
        code : DataTypes.STRING,
        description : DataTypes.STRING,
        expired_at : DataTypes.DATE,
        is_single_user : DataTypes.BOOLEAN,
        uesr_id : DataTypes.INTEGER,
        name : DataTypes.STRING,
        type : DataTypes.STRING,
        image_url : DataTypes.STRING,
        rules : DataTypes.TEXT,
        usage_count : DataTypes.INTEGER
    });
};

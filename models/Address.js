/**
 * addresses table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('address', {
        firstname:  {
            type : DataTypes.STRING,
            validate : {
                notNull : true
            }
        },
        middleabbr:  DataTypes.STRING,
        lastname:  DataTypes.STRING,
        address1:  {
            type : DataTypes.STRING,
            validate : {
                notNull : true
            }
        },
        address2:  DataTypes.STRING,
        city:  {
            type : DataTypes.STRING,
            validate : {
                notNull : true
            }
        },
        state_id:  DataTypes.INTEGER,
        zipcode:  {
            type : DataTypes.STRING,
            validate : {
                notNull : true
            }
        },
        country_id:  {
            type : DataTypes.STRING,
            validate : {
                notNull : true
            }
        },
        phone:  DataTypes.STRING,
        state_name:  DataTypes.STRING,
        alternative_phone:  DataTypes.STRING,
        mobile_phone:  DataTypes.STRING,
        fax:  DataTypes.STRING,
        email:  DataTypes.STRING,
        joint_firstname:  DataTypes.STRING,
        joint_middleabbr:  DataTypes.STRING,
        joint_lastname:  DataTypes.STRING
    }, {
        attributesAudited : ['firstname', 'middleabbr', 'lastname', 'address1', 'city', 'stated_id', 'country_id', 'joint_firstname', 'joint_middleabbr', 'joint_lastname']
    });
};

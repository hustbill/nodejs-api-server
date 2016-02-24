/**
 * state_events table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('state_event', {
        stateful_id:  DataTypes.INTEGER,
        user_id:  DataTypes.INTEGER,
        name:  DataTypes.STRING,
        previous_state:  DataTypes.STRING,
        stateful_type:  DataTypes.STRING,
        next_state:  DataTypes.STRING,
        name_reference_id:  DataTypes.INTEGER
    });
};

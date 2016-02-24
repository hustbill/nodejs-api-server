/**
 * delayed_jobs table definition
 */

module.exports = function (sequelize, DataTypes) {
    return sequelize.define('delayed_job', {
        priority:  DataTypes.INTEGER,
        attempts:  DataTypes.INTEGER,
        handler:  DataTypes.TEXT,
        last_error:  DataTypes.TEXT,
        run_at:  DataTypes.DATE,
        locked_at:  DataTypes.DATE,
        failed_at:  DataTypes.DATE,
        locked_by:  DataTypes.STRING,
        queue:  DataTypes.STRING
    });
};

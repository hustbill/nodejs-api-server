var fs = require('fs');
var path = require('path');
var Sequelize = require('sequelize');
var SequelizeAudit = require('../lib/audit/sequelize-audit');
var u = require('underscore');

/**
 * Cache of global instances of Sequelize and their models
 */
var cache = {};


/**
 * Add the global instance of Sequelize to the context, also exposed all
 * loaded models to context.models
 *
 * @method sequelize
 */
function sequelize(request, response, next) {
    var context = request.context;

    Object.keys(cache).forEach(function (type) {
        if (type === 'default') {
            context.sequelize = cache[type].instance;
            context.models = cache[type].models;
        } else {
            context[type + 'Sequelize'] = cache[type].instance;
            context[type + 'Models'] = cache[type].models;
        }
    });

    // Temp patch for read replication problem. FIXME later.
    context.readSequelize = context.sequelize;
    context.readModels = context.models;

    next(null);
}


/**
 * Create  global Sequelize instances and import all predefined models.
 *
 * @method sequelizer
 * @param modelsDirectory {String} Canonical path to modules directory
 * @param config {Object} server configuration object.
 * @param logger {Logger} logger object.
 * @return {Function} an express middleware function
 */
function sequelizer(modelsDirectory, config, logger) {
    if (Object.keys(cache).length === 0) {
        Object.keys(config.databases).forEach(function (type) {
            var dbConfig = config.databases[type],
                auditConfig = config.auditDatabase,
                options,
                associationsDirectory;

            options = u.clone(dbConfig.sequelize);
            options.protocol = dbConfig.protocol;
            options.host = dbConfig.host;
            options.port = dbConfig.port;

            logger.info(
                'Creating Sequelize instance: %s with options: %j.',
                type,
                options
            );

            cache[type] = cache[type] || {};

            if (auditConfig) {
                cache[type].instance = (new SequelizeAudit(auditConfig)).newSequelize(
                    dbConfig.name,
                    dbConfig.username,
                    dbConfig.password,
                    options
                );
            } else {
                cache[type].instance = new Sequelize(
                    dbConfig.name,
                    dbConfig.username,
                    dbConfig.password,
                    options
                );
            }

            logger.info(
                'Loading all Sequelize models from: %s.',
                modelsDirectory
            );

            cache[type].models = [];
            fs.readdirSync(modelsDirectory).forEach(function (filename) {
                /*jslint regexp: true */
                var match = /(\w+)\.js$/.exec(filename);

                if (match) {
                    logger.info(
                        'Importing model: %s from: %s.',
                        match[1],
                        filename
                    );

                    cache[type].models[match[1]] =
                        cache[type].instance['import'](
                            path.join(modelsDirectory, filename)
                        );
                }
            });

            associationsDirectory = path.join(modelsDirectory, 'associations');
            if (fs.existsSync(associationsDirectory)) {
                fs.readdirSync(associationsDirectory).forEach(function (filename) {
                    /*jslint regexp: true */
                    var match = /(\w+)\.js$/.exec(filename),
                        func;

                    if (match) {
                        logger.info(
                            'Importing association: %s from: %s.',
                            match[1],
                            filename
                        );

                        func = require(path.join(associationsDirectory, filename));
                        func(cache[type].instance, cache[type].models);
                    }
                });
            }
        });
    }

    return sequelize;
}

module.exports = sequelizer;

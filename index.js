/**
 * Organo Mobile Web Service, a.k.a Pulse
 */
var fs = require('fs');
var path = require('path');
var cluster = require('cluster');
var bunyan = require('bunyan');
var cm = require('cluster-master');

// Constants
var CONFIG_LOCATION = './config.json';
var SERVER_SCRIPT_LOCATION = './server.js';

var config,
    configFileLocation,
    logger;


try {
    // Load configuration, one time operation, so it's okay to be synchronise.
    /*jslint nomen:true*/
    configFileLocation = process.argv[2] || path.join(__dirname, CONFIG_LOCATION);
    config = JSON.parse(fs.readFileSync(configFileLocation));

    // Create master process logger
    logger = bunyan.createLogger({
        name : config.name,
        level : config.log.level,
        pid : process.pid,
        master : true
    });

    logger.info('Starting the server.');

    // Redirect console.log and console.error
    console.error = logger.warn.bind(logger);
    console.log = logger.info.bind(logger);


    // Forking worker processes
    logger.info('Forking worker processes.');
    config.cluster.exec = path.join(__dirname, SERVER_SCRIPT_LOCATION);
    cm(config.cluster);

    cluster.on('listening', function (worker, address) {
        logger.info(
            'Worker %s is listening at port: %j',
            worker.id,
            address.port
        );
    });

} catch (error) {
    (logger || console).error('Failed to start the server: %s', error.stack);
}

// Work around for node.js child process EPIPE error.
process.stdout.on('error', function (error) {
    if (error.code === 'EPIPE') {
        return;
    }

    throw error;
});

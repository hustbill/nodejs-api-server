/**
 * DAO loader.
 *
 * This module loads all files that has a .js suffix
 * and export them using their filename.
 *
 * It also provde a factory method to get all DAO objects.
 */

/*jslint regexp: true, nomen: true */

var fs = require('fs');
var path = require('path');
var assert = require('assert');

/**
 * Scan the directory and export all modules that ends with .js to the given
 * object using the module filename. Subdirectories will be recursively
 * applied.
 *
 * @method loadDirectory
 * @param exports {Object} to where all the JavaScript modules exported.
 * @param directory {String} absolute directory path.
 */
function loadDirectory(exports, directory) {
    fs.readdirSync(directory).forEach(function (filename) {
        var fullPath,
            stat,
            match;

        // Skip itself
        if (filename === 'index.js' || /^\./.test(filename)) {
            return;
        }

        fullPath = path.join(directory, filename);
        stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            exports[filename] = {};
            loadDirectory(exports[filename], fullPath);
        } else {
            match = /(\w+)\.js$/.exec(filename);

            if (match) {
                exports.__defineGetter__(match[1], function () {
                    return require(fullPath);
                });
            }
        }
    });

    return exports;
}

/**
 * Create a new DAO object using given DAO name and request context. The
 * method will search for the model class in this directory using the given
 * name plus a '.js' suffix.
 *
 * @method createDao
 */
function createDao(name, context) {
    assert(name && name.length > 0, 'name must be a non-empty string.');
    assert(typeof context === 'object', 'context must be a valid object.');

    if (context.daos && context.daos[name]) {
        return context.daos[name];
    }

    if (exports[name]) {
        var dao = new exports[name](context);
        if (!context.daos) {
            context.daos = {};
        }
        context.daos[name] = dao;
        return dao;
    }

    console.dir(exports);
    throw new Error('Cannot find given DAO class name: ' + name);
}

loadDirectory(exports, __dirname);
exports.createDao = createDao;



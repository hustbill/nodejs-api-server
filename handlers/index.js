/**
 * Handlers loader.
 *
 * This module loads all files that has a .js suffix
 * and export them using their filename.
 */

/*jslint regexp: true, nomen: true */

var fs = require('fs');

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

        fullPath = directory + '/' +  filename;
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

loadDirectory(exports, __dirname);

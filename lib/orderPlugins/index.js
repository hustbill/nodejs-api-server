var fs = require('fs');
var path = require('path');
var async = require('async');


exports.processOrderEvent = function (context, operation, eventName, options, order, callback) {
    var orderPluginsConfig = context.config.application.orderPlugins;
    if (!orderPluginsConfig) {
        callback();
        return;
    }

    async.forEachSeries(orderPluginsConfig, function (pluginConfig, callback) {
        var pluginName = pluginConfig.name;
        var plugin = require('./' + pluginName);
        if (!pluginConfig || !pluginConfig.enabled) {
            callback();
            return;
        }

        if (!plugin[eventName]) {
            callback();
            return;
        }

        plugin[eventName].call(plugin, context, operation, options, order, function (error) {
            callback(error);
        });
    }, function (error) {
        callback(error);
    });
};

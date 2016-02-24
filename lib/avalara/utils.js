/*jslint nomen: true, newcap: true */

var path = require('path');
var soap = require('../soap/soap');


function initSoapClientHeader(client, options) {
    var profileHeader = {
        Profile : {
            Name : 'node-avalara',
            Client : '0.1.0',
            Adapter : 'node-avalara, 0.1.0',
            Machine : ''
        }
    };
    client.addSoapHeader(client.wsdl.objectToXML(profileHeader, 'Profile', '', 'http://avatax.avalara.com/services', true));

    client.setSecurity(new soap.WSSecurity(options.username, options.password));
}


function createSoapClient(wsdlName, options, callback) {
    soap.createClient(path.join(__dirname, './wsdl/' + wsdlName), {endpoint : options.endpoint}, function (err, client) {
        if (err) {
            callback(err);
            return;
        }

        initSoapClientHeader(client, options);
        callback(null, client);
    });
}


exports.createSoapService = function (serviceClass, wsdlName, options, callback) {
    createSoapClient(wsdlName, options, function (err, client) {
        if (err) {
            callback(err);
            return;
        }

        var service = new serviceClass(client);
        callback(null, service);
    });
};

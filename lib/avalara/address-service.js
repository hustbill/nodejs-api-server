var utils = require('./utils');


function AddressService(client) {
    this.client = client;
}


AddressService.prototype.ping = function (text, callback) {
    this.client.Ping(text, function (error, response) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, response.PingResult);
    });
};


AddressService.prototype.validate = function (validateRequest, callback) {
    this.client.Validate({ValidateRequest : validateRequest}, function (error, response) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, response.ValidateResult);
    });
};


function createService(options, callback) {
    var createSoapOptions = {
            endpoint : options.webAddress + '/Address/AddressSvc.asmx',
            username : options.username,
            password : options.password
        };
    utils.createSoapService(AddressService, 'AddressSvc.wsdl', createSoapOptions, callback);
}


exports.createService = createService;

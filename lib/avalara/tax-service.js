var utils = require('./utils');


function TaxService(client) {
    this.client = client;
}


TaxService.prototype.getTax = function (request, callback) {
    this.client.GetTax({GetTaxRequest : request}, function (error, response) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, response.GetTaxResult);
    });
};


TaxService.prototype.getTaxHistory = function (request, callback) {
    this.client.GetTaxHistory({GetTaxHistoryRequest : request}, function (error, response) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, response.GetTaxHistoryResult);
    });
};


TaxService.prototype.postTax = function (request, callback) {
    this.client.PostTax({PostTaxRequest : request}, function (error, response) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, response.PostTaxResult);
    });
};


TaxService.prototype.commitTax = function (request, callback) {
    this.client.CommitTax({CommitTaxRequest : request}, function (error, response) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, response.CommitTaxResult);
    });
};


TaxService.prototype.cancelTax = function (request, callback) {
    this.client.CancelTax({CancelTaxRequest : request}, function (error, response) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, response.CancelTaxResult);
    });
};


function createService(options, callback) {
    var createSoapOptions = {
            endpoint : options.webAddress + '/Tax/TaxSvc.asmx',
            username : options.username,
            password : options.password
        };
    utils.createSoapService(TaxService, 'TaxSvc.wsdl', createSoapOptions, callback);
}


exports.createService = createService;

// UPS address validation service

var https = require('https');
var util = require('util');

var builder = require('xmlbuilder');
var parseString = require('xml2js').parseString;

var request = require('request');

var sidedoor = require('sidedoor');

var requestOptions = {
    url: 'https://onlinetools.ups.com/ups.app/xml/AV',
    headers: {"Content-Type": "text/xml"}
};


/**
 * Return an authentication request XML
 * 
 * Below is an example of returning XML
 *
 * <?xml version='1.0'?>
 * <AccessRequest>
 *    <AccessLicenseNumber>0C8BF3C69655B0C0</AccessLicenseNumber>
 *    <UserId>organogold</UserId>
 *    <Password>abcd1234</Password>
 * </AccessRequest>
 *
 *
 * @method getAuthenticationXML
 * @param  accessLicenseNumber {String} access license number 
 * @param  userId {String} userId 
 * @param  password {String} password 
 * @return {String} authentication request XML.
 */
function getAuthenticationXML(accessLicenseNumber, userId, password) {
    var root;

    root = builder.create('AccessRequest');
    root.ele('AccessLicenseNumber', accessLicenseNumber);
    root.ele('UserId', userId);
    root.ele('Password', password);

//    return (root.end({pretty: true}));
	return (root.end());
}

/**
 * Return an address request XML
 * 
 * Below is an example of returning XML
 *
 * <?xml version='1.0'?>
 * <AddressValidationRequest xml:lang="en-US">
 *   <Request>
 *      <TransactionReference>
 *        <XpciVersion>1.0001</XpciVersion>
 *      </TransactionReference>
 *      <RequestAction>AV</RequestAction>
 *   </Request>
 *   <Address>
 *     <City>city</City>
 *     <StateProvinceCode>state.abbr</StateProvinceCode>
 *     <CountryCode>country.iso</CountryCode>
 *     <PostalCode>zipcode</PostalCode>
 *   </Address>
 * </AddressValidationRequest>
 *
 *
 * @method getAuthenticationXML
 * @param  options {Object} 
 * { city: city, 
 *   stateProvinceCode: stateProvinceCode, 
 *   countryCode: countryCode,
 *   postalCode: postalCode 
 * }
 *  
 * @return {String} address request XML.
 */
function getAddressXML(options) {
    var address,
        request,
        root;

    root = builder.create('AddressValidationRequest');
    root.att('xml:lang', 'en-US');

    // Request section
    request = root.ele('Request');
    request.ele('TransactionReference')
        .ele('XpciVersion', '1.0001');
    request.ele('RequestAction', 'AV');

    // Address section
    address = root.ele('Address');
    address.ele('City', options.city || '');
    address.ele('StateProvinceCode', options.stateProvinceCode || '');
    address.ele('CountryCode', options.countryCode || '');
    address.ele('PostalCode', options.postalCode ? options.postalCode.toString() : '');

    return (root.end());
}


/**
 * process response XML
 *
 * Below is an example of response XML
 *
 * <?xml version="1.0"?>
 * <AddressValidationResponse>
 *	<Response>
 *		<TransactionReference>
 *			<XpciVersion>1.0001</XpciVersion>
 *		</TransactionReference>
 *		<ResponseStatusCode>1</ResponseStatusCode>
 *		<ResponseStatusDescription>Success</ResponseStatusDescription>
 *	</Response>
 *	<AddressValidationResult>
 *		<Rank>1</Rank>
 *		<Quality>1.0</Quality>
 *		<Address>
 *			<City>SANTA CLARA</City><StateProvinceCode>CA</StateProvinceCode>
 *		</Address>
 *		<PostalCodeLowEnd>95050</PostalCodeLowEnd>
 *		<PostalCodeHighEnd>95056</PostalCodeHighEnd>
 *	</AddressValidationResult>
 * </AddressValidationResponse>
 *
 * @method processResponseXML
 * @param  options {String} response XML from UPS
 * @param callback {Function}, return an error object.
 * 
 */
function processResponseXML(responseXML, callback) {
    var quality,
        responseStatudCode;

    parseString(
        responseXML,
        function (error, result) {
            if (error) {
                error.developerMessage = "Parse response XML failed: (" + responseXML + ")";
                callback(error);
                return;
            }

            try {
                responseStatudCode = result.AddressValidationResponse.Response[0].ResponseStatusCode[0];
            } catch (exception1) {
                exception1.statusCode = 500;
                callback(exception1);
                return;
            }
            if (responseStatudCode !== '1') {
                // code 250003: Invalid Access License number 
                // code 20008:  The field, PostalCode|Country, contains invalid data
                error = new Error('UPS address validation failed, bad response status code.');
                error.statusCode = 500;
                error.developerMessage = 'RESPONSE XML('  + responseXML + ')';
                callback(error);
                return;
            }

            try {
                quality = result.AddressValidationResponse.AddressValidationResult[0].Quality[0];
            } catch (exception2) {
                exception2.statusCode = 500;
                callback(exception2);
                return;
            }
            if (parseInt(quality, 10) !== 1) {
                error = new Error('UPS address validation failed, bad quality.');
                error.statusCode = 500;
                error.developerMessage = 'RESPONSE XML(' + responseXML + ')';
                callback(error);
                return;
            }

            callback(null);
        }
    );
}

/**
 * Send XML request to be UPS addres validation service
 *
 * @method getUPSValidationXMLResponse
 * @options type {Object} request options
 * @xmlRequest type {String} xml request
 * 
 */
function getUPSValidationXMLResponse(options, xmlRequest, callback) {
    var error;

    options.body = xmlRequest;
    request.post(
        options,
        function (error, response, body) {
            if (error) {
                error = new Error("UPS validation service error: " + ((error && error.message) || error));
                error.errorCode = 'UPSValidationServiceError';
                callback(error);
                return;
            }

            if (response.statusCode !== 200) {
                if (!error) {
                    error = new Error('UPS address validation request failed with status code: ' + response.statusCode);
                }
                error.statusCode = response.statusCode;
                error.developerMessage =
                    'REQUEST OPTIONS(' +
                    util.inspect(options) +
                    '),  ' +
                    'RESPONSE HEADERS(' +
                    util.inspect(response.headers) +
                    '),   RESPONSE BODY(' +
                    util.inspect(response.body) +
                    ')';

                callback(error);
                return;
            }
            callback(null, body);
        }
    );
}

/**
 * validate an US address using UPS address validation service
 *
 * @method isValidAddress
 * @param  options {Object} 
 * { city: city, 
 *   stateProvinceCode: stateProvinceCode, 
 *   countryCode: countryCode,
 *   postalCode: postalCode 
 * }
 * @param callback {Function} express response object.
 * 
 */
function isValidAddress(context, address, callback) {
    var xmlRequest,
        config = context.config.ups;

    xmlRequest =
        getAuthenticationXML(config.accessLicenseNumber, config.userId, config.password) +
        getAddressXML(address);

    getUPSValidationXMLResponse(
        requestOptions,
        xmlRequest,
        function (error, result) {
            if (error) {
                if (error.errorCode === 'UPSValidationServiceError') {
                    callback();
                    return;
                }

                callback(error);
                return;
            }
            processResponseXML(result, callback);
        }
    );
}

module.exports.isValidAddress = isValidAddress;

// Expose the secondary API
sidedoor.expose(
    module,
    'privateAPIs',
    {
        getAuthenticationXML: getAuthenticationXML,
        getAddressXML: getAddressXML,
        getUPSValidationXMLResponse: getUPSValidationXMLResponse,
        processResponseXML: processResponseXML
    }
);

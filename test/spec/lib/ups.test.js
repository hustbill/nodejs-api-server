/*global describe, it */
/*jshint expr:true */

var rewire = require('rewire');
var expect = require('chai').expect;
var async = require('async');
var testUtil = require('../../testUtil');

var sidedoor = require('sidedoor');
var suitPath = '../../../lib/ups.js';
var ups = rewire(suitPath);
var privateAPIs = sidedoor.get(suitPath, 'privateAPIs');


function getContext(callback) {
    testUtil.getContext({
        emptyLogger : false,
        user : true
    }, callback);
}

describe('lib/ups', function () {
    describe('getAuthenticationXML', function () {
        it('should work', function (done) {
            var authenticationXML,
                expectedXML = "<?xml version=\"1.0\"?><AccessRequest><AccessLicenseNumber>accessLicenseNumber</AccessLicenseNumber><UserId>userId</UserId><Password>password</Password></AccessRequest>";

            authenticationXML = privateAPIs.getAuthenticationXML('accessLicenseNumber', 'userId', 'password');
            expect(authenticationXML).to.equal(expectedXML);

            done();
        });
    });


    describe('getAddressXML', function () {
        it('should work', function (done) {
            var addressXML,
                expectedXML = "<?xml version=\"1.0\"?><AddressValidationRequest xml:lang=\"en-US\"><Request><TransactionReference><XpciVersion>1.0001</XpciVersion></TransactionReference><RequestAction>AV</RequestAction></Request><Address><City>Santa Clara</City><StateProvinceCode>CA</StateProvinceCode><CountryCode>US</CountryCode><PostalCode>95051</PostalCode></Address></AddressValidationRequest>";

            addressXML =
                privateAPIs.getAddressXML(
                    {
                        city: 'Santa Clara',
                        stateProvinceCode: 'CA',
                        countryCode: 'US',
                        postalCode: 95051
                    }
                );
            expect(addressXML).to.equal(expectedXML);

            done();
        });
    });


    describe('processResponseXML', function () {
        it('should work', function (done) {
            var	responseXML = "<?xml version=\"1.0\"?><AddressValidationResponse><Response><TransactionReference><XpciVersion>1.0001</XpciVersion></TransactionReference><ResponseStatusCode>1</ResponseStatusCode><ResponseStatusDescription>Success</ResponseStatusDescription></Response><AddressValidationResult><Rank>1</Rank><Quality>1.0</Quality><Address><City>SANTA CLARA</City><StateProvinceCode>CA</StateProvinceCode></Address><PostalCodeLowEnd>95050</PostalCodeLowEnd><PostalCodeHighEnd>95056</PostalCodeHighEnd></AddressValidationResult></AddressValidationResponse>";

            privateAPIs.processResponseXML(
                responseXML,
                function (error) {
                    expect(error).to.be.not.ok;

                    done();
                }
            );
        });


        it('should callback error if response bad status code', function (done) {
            var	responseXML = "<?xml version=\"1.0\"?><AddressValidationResponse><Response><TransactionReference><XpciVersion>1.0001</XpciVersion></TransactionReference><ResponseStatusCode>0.9</ResponseStatusCode><ResponseStatusDescription>Success</ResponseStatusDescription></Response><AddressValidationResult><Rank>1</Rank><Quality>1.0</Quality><Address><City>SANTA CLARA</City><StateProvinceCode>CA</StateProvinceCode></Address><PostalCodeLowEnd>95050</PostalCodeLowEnd><PostalCodeHighEnd>95056</PostalCodeHighEnd></AddressValidationResult></AddressValidationResponse>";

            privateAPIs.processResponseXML(
                responseXML,
                function (error) {
                    expect(error).to.be.instanceof(Error);
                    expect(error.message).to.equal('UPS address validation failed, bad response status code.');
                    expect(error.statusCode).to.equal(500);

                    done();
                }
            );
        });


        it('should callback error if response bad quality', function (done) {
            var	responseXML = "<?xml version=\"1.0\"?><AddressValidationResponse><Response><TransactionReference><XpciVersion>1.0001</XpciVersion></TransactionReference><ResponseStatusCode>1</ResponseStatusCode><ResponseStatusDescription>Success</ResponseStatusDescription></Response><AddressValidationResult><Rank>1</Rank><Quality>0.99</Quality><Address><City>SANTA CLARA</City><StateProvinceCode>CA</StateProvinceCode></Address><PostalCodeLowEnd>95050</PostalCodeLowEnd><PostalCodeHighEnd>95056</PostalCodeHighEnd></AddressValidationResult></AddressValidationResponse>";

            privateAPIs.processResponseXML(
                responseXML,
                function (error) {
                    expect(error).to.be.instanceof(Error);
                    expect(error.message).to.equal('UPS address validation failed, bad quality.');
                    expect(error.statusCode).to.equal(500);

                    done();
                }
            );
        });
    });


    describe('getUPSValidationXMLResponse', function () {
        it('should work', function (done) {
            this.timeout(10000);

            var address,
                requestOptions,
                requestXML,
                expectedResponseXML;

            address = {
                city: 'Santa Clara',
                stateProvinceCode: 'CA',
                countryCode: 'US',
                postalCode: 95051
            };

            requestOptions = {
                url: 'https://wwwcie.ups.com:443/ups.app/xml/AV',
                headers: {
                    "Content-Type": "text/xml"
                }
            };

            expectedResponseXML = "<?xml version=\"1.0\"?><AddressValidationResponse><Response><TransactionReference><XpciVersion>1.0001</XpciVersion></TransactionReference><ResponseStatusCode>1</ResponseStatusCode><ResponseStatusDescription>Success</ResponseStatusDescription></Response><AddressValidationResult><Rank>1</Rank><Quality>1.0</Quality><Address><City>SANTA CLARA</City><StateProvinceCode>CA</StateProvinceCode></Address><PostalCodeLowEnd>95050</PostalCodeLowEnd><PostalCodeHighEnd>95056</PostalCodeHighEnd></AddressValidationResult></AddressValidationResponse>";

            requestXML =
                privateAPIs.getAuthenticationXML('0C8BF3C69655B0C0', 'organogold', 'abcd1234') +
                privateAPIs.getAddressXML(address);

            privateAPIs.getUPSValidationXMLResponse(
                requestOptions,
                requestXML,
                function (error, result) {
                    expect(error).to.be.not.ok;
                    expect(result).to.equal(expectedResponseXML);

                    done();
                }
            );
        });


        it('should callback error with statusCode 404 if we requested a bad url.', function (done) {
            var address,
                requestOptions,
                requestXML;

            address = {
                city: 'Santa Clara',
                stateProvinceCode: 'CA',
                countryCode: 'US',
                postalCode: 95051
            };

            requestOptions = {
                url: 'https://wwwcie.ups.com:443/ups.app/xml/AV/BAD',
                headers: {
                    "Content-Type": "text/xml"
                }
            };

            requestXML =
                privateAPIs.getAuthenticationXML('0C8BF3C69655B0C0', 'organogold', 'abcd1234') +
                privateAPIs.getAddressXML(address);

            privateAPIs.getUPSValidationXMLResponse(
                requestOptions,
                requestXML,
                function (error, result) {
                    expect(error).to.be.instanceof(Error);
                    expect(error.message).to.equal('UPS address validation request failed with status code: 404');
                    expect(error.statusCode).to.equal(404);

                    done();
                }
            );
        });
    });


    describe('isValidAddress', function (done) {
        it('validation should pass if `getUPSValidationXMLResponse` callbacks `UPSValidationServiceError` error.', function (done) {
            var address,
                getUPSValidationXMLResponse = ups.getUPSValidationXMLResponse;

            ups.__set__('getUPSValidationXMLResponse', function (options, xmlRequest, callback) {
                var error = new Error('UPSValidationServiceError');
                error.errorCode = 'UPSValidationServiceError';
                callback(error);
                return;
            });

            address = {
                city: '',
                stateProvinceCode: '',
                countryCode: '',
                postalCode: ''
            };

            async.waterfall([
                getContext,

                function (context, callback) {
                    ups.isValidAddress(context, address, function (error, isValid) {
                        expect(error).to.be.not.ok;
                        callback();
                    });
                }
            ], function (error) {
                ups.__set__('getUPSValidationXMLResponse', getUPSValidationXMLResponse);
                done(error);
            });
        });
    });

});

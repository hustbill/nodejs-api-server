var YUITest = require('yuitest').YUITest;
var Assert = YUITest.Assert;

var mockery = require('mockery');
var sidedoor = require('sidedoor');

var util = require('util');

var privateAPIs = sidedoor.get('./../../../lib/ups', 'privateAPIs');

YUITest.TestRunner.add(new YUITest.TestCase({
    name : 'AuthenticationXML',

    testGetAuthenticationXML : function () {
        var authenticationXML,
            expectedXML = "<?xml version=\"1.0\"?><AccessRequest><AccessLicenseNumber>accessLicenseNumber</AccessLicenseNumber><UserId>userId</UserId><Password>password</Password></AccessRequest>";

        authenticationXML = privateAPIs.getAuthenticationXML('accessLicenseNumber', 'userId', 'password');
        Assert.areSame(authenticationXML, expectedXML);
    }
}));

YUITest.TestRunner.add(new YUITest.TestCase({
    name : 'AddressXML',

    testGetAddressXML : function () {
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
        Assert.areSame(addressXML, expectedXML);
    }
}));

YUITest.TestRunner.add(new YUITest.TestCase({
    name : 'processResponseXML',

    testSuccessResponseXML : function () {
        var	responseXML = "<?xml version=\"1.0\"?><AddressValidationResponse><Response><TransactionReference><XpciVersion>1.0001</XpciVersion></TransactionReference><ResponseStatusCode>1</ResponseStatusCode><ResponseStatusDescription>Success</ResponseStatusDescription></Response><AddressValidationResult><Rank>1</Rank><Quality>1.0</Quality><Address><City>SANTA CLARA</City><StateProvinceCode>CA</StateProvinceCode></Address><PostalCodeLowEnd>95050</PostalCodeLowEnd><PostalCodeHighEnd>95056</PostalCodeHighEnd></AddressValidationResult></AddressValidationResponse>";

        privateAPIs.processResponseXML(
            responseXML,
            function (error) {
                Assert.isNull(error);
            }
        );
    },

    testBadResponseStatusCode : function () {
        var	responseXML = "<?xml version=\"1.0\"?><AddressValidationResponse><Response><TransactionReference><XpciVersion>1.0001</XpciVersion></TransactionReference><ResponseStatusCode>0.9</ResponseStatusCode><ResponseStatusDescription>Success</ResponseStatusDescription></Response><AddressValidationResult><Rank>1</Rank><Quality>1.0</Quality><Address><City>SANTA CLARA</City><StateProvinceCode>CA</StateProvinceCode></Address><PostalCodeLowEnd>95050</PostalCodeLowEnd><PostalCodeHighEnd>95056</PostalCodeHighEnd></AddressValidationResult></AddressValidationResponse>";

        privateAPIs.processResponseXML(
            responseXML,
            function (error) {
                Assert.isInstanceOf(Error, error);
                Assert.areSame(error.message, 'UPS address validation failed, bad response status code.');
                Assert.areSame(error.statusCode, 500);
            }
        );
    },

    testGoodResponseCodeBadQuality : function () {
        var	responseXML = "<?xml version=\"1.0\"?><AddressValidationResponse><Response><TransactionReference><XpciVersion>1.0001</XpciVersion></TransactionReference><ResponseStatusCode>1</ResponseStatusCode><ResponseStatusDescription>Success</ResponseStatusDescription></Response><AddressValidationResult><Rank>1</Rank><Quality>0.99</Quality><Address><City>SANTA CLARA</City><StateProvinceCode>CA</StateProvinceCode></Address><PostalCodeLowEnd>95050</PostalCodeLowEnd><PostalCodeHighEnd>95056</PostalCodeHighEnd></AddressValidationResult></AddressValidationResponse>";

        privateAPIs.processResponseXML(
            responseXML,
            function (error) {
                Assert.isInstanceOf(Error, error);
                Assert.areSame(error.message, 'UPS address validation failed, bad quality.');
                Assert.areSame(error.statusCode, 500);
            }
        );
    }
/*	
    testBadXML : function () {
        var	responseXML = "<?xml version=\"1.0\"?>ddressValidationResponse><Response><TransactionReference><XpciVersion>1.0001</XpciVersion></TransactionReference><ResponseStatusCode>1</ResponseStatusCode><ResponseStatusDescription>Success</ResponseStatusDescription></Response><AddressValidationResult><Rank>1</Rank><Quality>0.99</Quality><Address><City>SANTA CLARA</City><StateProvinceCode>CA</StateProvinceCode></Address><PostalCodeLowEnd>95050</PostalCodeLowEnd><PostalCodeHighEnd>95056</PostalCodeHighEnd></AddressValidationResult></AddressValidationResponse>";
        
        privateAPIs.processResponseXML(
            responseXML, function (error) {
                Assert.isInstanceOf(TypeError, error);
                Assert.areSame(error.statusCode, 500);
            }
        );
    }
*/
}));

YUITest.TestRunner.add(new YUITest.TestCase({
    name : 'getUPSValidationXMLResponse',

    setUp : function () {
        this.requestOptions = {
            url: 'https://wwwcie.ups.com:443/ups.app/xml/AV',
            headers: {
                "Content-Type": "text/xml"
            }
        };

        this.address = {
            city: 'Santa Clara',
            stateProvinceCode: 'CA',
            countryCode: 'US',
            postalCode: 95051
        };
    },

    testGetSuccessfulResponse : function () {
        var requestXML,
            expectedResponseXML,
            test = this;

        expectedResponseXML = "<?xml version=\"1.0\"?><AddressValidationResponse><Response><TransactionReference><XpciVersion>1.0001</XpciVersion></TransactionReference><ResponseStatusCode>1</ResponseStatusCode><ResponseStatusDescription>Success</ResponseStatusDescription></Response><AddressValidationResult><Rank>1</Rank><Quality>1.0</Quality><Address><City>SANTA CLARA</City><StateProvinceCode>CA</StateProvinceCode></Address><PostalCodeLowEnd>95050</PostalCodeLowEnd><PostalCodeHighEnd>95056</PostalCodeHighEnd></AddressValidationResult></AddressValidationResponse>";

        requestXML =
            privateAPIs.getAuthenticationXML('0C8BF3C69655B0C0', 'organogold', 'abcd1234') +
            privateAPIs.getAddressXML(this.address);

        privateAPIs.getUPSValidationXMLResponse(
            this.requestOptions,
            requestXML,
            function (error, result) {
                test.resume(
                    function () {
                        Assert.isNull(error);
                        Assert.areSame(result, expectedResponseXML);
                    }
                );
            }
        );

        this.wait();
    },

    testBadURL : function () {
        var requestXML,
            test = this;

        requestXML =
            privateAPIs.getAuthenticationXML('0C8BF3C69655B0C0', 'organogold', 'abcd1234') +
            privateAPIs.getAddressXML(this.address);

        this.requestOptions.url = 'https://wwwcie.ups.com:443/ups.app/xml/AV/BAD';

        privateAPIs.getUPSValidationXMLResponse(
            this.requestOptions,
            requestXML,
            function (error, result) {
                test.resume(
                    function () {
                        Assert.isNotNull(error);
                        Assert.areSame(error.message, 'UPS address validation request failed with status code: 404');
                        Assert.areSame(error.statusCode, 404);
                    }
                );
            }
        );

        this.wait();
    }
}));

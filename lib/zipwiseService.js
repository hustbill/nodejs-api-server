var request = require('request');
var u = require('underscore');

function prepareRequestOptions(context, zipCode) {
    var config = context.config.zipwise || {},
        url = "https://www.zipwise.com/webservices/radius.php?format=json&key="+config.key+"&radius="+config.radius+"&zip="+zipCode,
        timeout = config.timeout,
        requestOptions;

    requestOptions = {
        method : 'POST',
        headers : {
            Accept : 'application/json',
            'Content-Type' : 'application/json',
            'Accept-Language' : 'en-US',
            'User-Agent' : 'AboveGem-API-Server/2.0.0'
        },
        url : url,
        timeout : timeout
    };

    return requestOptions;
}

exports.queryZipcode = function (context, zipCode, callback) {
    var logger = context.logger,
        requestOptions = prepareRequestOptions(context, zipCode),
        zipCodes = [];

    logger.debug("Sending request with options %j", requestOptions);
    request(requestOptions, function (error, response, body) {
        if (error) {
            logger.error(
                "Error when sending request: %s options:%j",
                (error && error.message), requestOptions
            );
        }


        if(u.isString(body)){
            body = JSON.parse(body);
        }

        if(body.results){
            if(u.isArray(body.results)){
                // logger.info("result for query %s:%j", zipCode, body.results);
                body.results.forEach(function(item){
                    zipCodes.push(item.zip);
                });
            }else{
                logger.error("error when query zip:%j", body.results);
            }
            
        }

        if(u.isEmpty(zipCodes)){
            zipCodes.push(zipCode);
        }

        callback(null, zipCodes);
    });


};
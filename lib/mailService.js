/**
 * mail service
 */

var request = require('request');

function prepareRequestOptions(context, mailType, mailData) {
    var mailServiceConfig = context.config.mailService,
        url = mailServiceConfig.serverAddress + "/emails/" + mailType,
        clientId = mailServiceConfig.clientId,
        timeout = mailServiceConfig.timeout,
        requestOptions;

    requestOptions = {
        method : 'POST',
        headers : {
            Accept : 'application/json',
            'Accept-Language' : 'en-US',
            'Content-Type' : 'application/json',
            'User-Agent' : 'mobile-pulse/2.0.0',
            'X-Client-Id' : clientId,
            'X-Company-Code' : context.companyCode,
        },
        url : url,
        timeout : timeout,
        json : mailData
    };

    return requestOptions;
}

exports.sendMail = function (context, mailType, mailData, callback) {
    var logger = context.logger,
        requestOptions = prepareRequestOptions(context, mailType, mailData);

    logger.debug("Sending mail of type %s with data %j", mailType, mailData);
    request(requestOptions, function (error, response, body) {
        if (error) {
            logger.error(
                "Error when sending mail of type %s: %s",
                mailType,
                (error && error.message)
            );
        }
    });

    if (callback) {
        callback();
    }
};

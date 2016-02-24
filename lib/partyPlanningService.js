/**
 * party planning service
 */

var request = require('request');

function prepareGetEventByIdRequestOptions(context, eventId) {
    var partyPlanningServiceConfig = context.config.partyPlanningService,
        url = partyPlanningServiceConfig.serverAddress + "/events/" + eventId,
        clientId = partyPlanningServiceConfig.clientId,
        timeout = partyPlanningServiceConfig.timeout,
        requestOptions;

    requestOptions = {
        method : 'GET',
        headers : {
            Accept : 'application/json',
            'Accept-Language' : 'en-US',
            'Content-Type' : 'application/json',
            'User-Agent' : 'main-service/2.0.0',
            'X-Client-Id' : clientId
        },
        url : url,
        timeout : timeout
    };

    return requestOptions;
}

exports.getEventById = function (context, eventId, callback) {
    var logger = context.logger,
        requestOptions = prepareGetEventByIdRequestOptions(context, eventId);

    logger.debug("Getting event details by id %s", eventId);
    request(requestOptions, function (error, response, body) {
        if (error) {
            logger.error(
                "Error when getting event details by id %d",
                eventId
            );
            callback(error);
            return;
        }

        if (response.statusCode !== 200) {
            error = new Error("Failed to get event detail.");
            callback(error);
            return;
        }

        if (typeof body === 'string') {
            body = JSON.parse(body);
        }
        callback(null, body.response);
    });
};

// GET /v2/clients/versions[?type=ios,android]

/**
 * Return the latest version numbers of android and ios app
 */
function get(request, response, next) {
    var android,
        context = request.context,
        error,
        ios,
        result = { statusCode : 200, body : {} },
        types = request.query.types;

    ios = android = true;

    if (types) {
        types = types.toLowerCase();
        android = (types.indexOf('android') !== -1);
        ios = (types.indexOf('ios') !== -1);
    }

    if ((android || ios) === false) {
        error = new Error("client version type is empty");
        error.statusCode = 400;
        next(error);
        return;
    }

    if (android) {
        result.body['android-version'] = '1.23';
    }

    if (ios) {
        result.body['ios-version'] = '1.1.4';
    }

    next(result);
}

module.exports = get;

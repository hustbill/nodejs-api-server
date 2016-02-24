// GET /v2/shopping-service-status

/**
 * Return the status of shopping service.
 */
function get(req, res, next) {
    var status = req.context.config.shoppingServiceDisabled ? 'unavailable' : 'available',
        result = {
            statusCode : 200,
            body : {
                status : status
            }
        };
    next(result);
}

module.exports = get;

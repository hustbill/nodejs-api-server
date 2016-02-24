// GET /v2/service-contacts

/**
 * Return the distributor service contact information.
 */
function get(request, response, next) {
    var context = request.context,
        logger = context.logger,
        localTime = new Date(),
        result = { statusCode : 200 };

    logger.debug('Generating distributor service contact information.');

    result.body = [
        {
            regions : "Canada & USA",
            phones : "1-877-674-2661 or 1-604-638-6840",
            email : "support@organogold.com",
            'local-time' : localTime.toLocaleDateString(), //"Mon July 09 2012 - 22:09:37",
            'office-hours' : "M-F 7am-5pm"
        },
        {
            regions : "Europe",
            phones : "31 10 7994319",
            email : "europe@organogold.com",
            'local-time' : localTime.toLocaleDateString(),
            'office-hours' : "M-F 7am-5pm"
        }
    ];

    next(result);
}

module.exports = get;

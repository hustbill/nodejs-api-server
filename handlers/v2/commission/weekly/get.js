// GET /v2/commissions/weekly?date=weekly-date

var async = require('async');
var daos = require('../../../../daos');
var utils = require('../../../../lib/utils');

function getRetailCommissions(retailCommissionData) {
    var result = [],
        retailCommissionDataArray,
        salePrice,
        wholesalePrice;

    retailCommissionData.replace(/\{|\}/g, '').split(/\)"/).slice(0, -1).forEach(function (element) {
        retailCommissionDataArray = element.replace(/"|\(|\)|\\/g, '').split(',');
		salePrice = parseFloat(retailCommissionDataArray[7]);
		wholesalePrice = parseFloat(retailCommissionDataArray[8]);
        result.push(
            {
                'country-iso': retailCommissionDataArray[0],
                'distributor-id' : parseInt(retailCommissionDataArray[1], 10),
                'ship-to-name' : retailCommissionDataArray[2],
                'order-id' : retailCommissionDataArray[3],
                'order-date' : retailCommissionDataArray[4],
                'currency-symbol' : retailCommissionDataArray[5],
                'sale-price' : salePrice,
                'wholesale-price' : wholesalePrice,
                'retail-profit' : parseFloat((wholesalePrice - salePrice).toFixed(2))
            }
        );
    });
    return result;
}

function getFastTrackCommissions(fastTrackData) {
    var result = [],
        fastTrackDataArray;

    fastTrackData.replace(/\{|\}/g, '').split(/\)"/).slice(0, -1).forEach(function (element) {
        fastTrackDataArray = element.replace(/"|\(|\)|\\/g, '').split(',');
        result.push(
            {
                'country-iso' : fastTrackDataArray[0],
                'distributor-id' : parseInt(fastTrackDataArray[1], 10),
                'ship-to-name' : fastTrackDataArray[2],
                'order-id' : fastTrackDataArray[3],
                'order-date' : fastTrackDataArray[4],
                'currency-symbol' : fastTrackDataArray[5],
                'sale-price' : parseFloat(fastTrackDataArray[7]),
                'fast-track-volume' : parseFloat(fastTrackDataArray[8]),
                'fast-track-earnings' : parseFloat(fastTrackDataArray[8])
            }
        );
    });
    return result;
}

/**
 * Get response JSON
 *
 * @method generateResponse
 * @param row {Object} row has the following fields:
 *
 * prev_pv_co_left        | 190704657.00
 * prev_pv_co_right       | 0.00
 * curr_pv_co_left        | 192289772.54
 * curr_pv_co_right       | 0.00
 * pv_left_sum            | 2074072.76
 * pv_right_sum           | 488957.22
 * bonus                  | 75000.00
 * bonus_percentage       | 0.20
 * fx_rate                | 1.00
 * retail_commission_info | 
 * fasttrack_earning_info |
 *
 */
// bonus_before_dtcap = [commissions_dualteam[:bonus_cap].to_f, commissions_dualteam[:bonus_no_cap].to_f].min
function generateResponse(row) {
    if (!row) {
        return {statusCode : 200, body: {}};
    }

    var result = { statusCode : 200 },
        beginVolLeft = row.prev_pv_co_left,
        beginVolRight = row.prev_pv_co_right,
        endVolLeft = row.curr_pv_co_left,
        endVolRight = row.curr_pv_co_right,
        currentVolLeft = row.pv_left_sum,
        currentVolRight = row.pv_right_sum,
        dualteamBonus = row.bonus,
        exchangeRate = row.fx_rate,
        percentagePaid,
        paid,
        volCapLeft,
        volCapRight,
        bonusBeforeCap = 0.00,
        pgdtv = row.pvdt_sum_ul_all,
        payout = row.pvdt_pay_volume;

    if (row.bonus_percentage === null) {
        percentagePaid = 0;
        paid = 0;
        volCapLeft = volCapRight = 0;
    } else {
        percentagePaid = row.bonus_percentage;
        if ((row.bonus_no_cap !== null) && (row.bonus_cap !== null)) {
            bonusBeforeCap = Math.min(parseFloat(row.bonus_no_cap), parseFloat(row.bonus_cap));
        }
        if (bonusBeforeCap > 0) {
            paid = bonusBeforeCap / percentagePaid;
        } else {
            paid = dualteamBonus / percentagePaid;
        }

        volCapLeft = parseFloat((beginVolLeft + currentVolLeft - paid - endVolLeft).toFixed(2));
        volCapRight = parseFloat((beginVolRight + currentVolRight - paid - endVolRight).toFixed(2));
    }


    result.body = {
        'previous-dt-volume-left' : beginVolLeft,
        'previous-dt-volume-right' : beginVolRight,
        'current-dt-volume-left' : currentVolLeft,
        'current-dt-volume-right' : currentVolRight,
        'total-dt-volume-left' : parseFloat((beginVolLeft + currentVolLeft).toFixed(2)),
        'total-dt-volume-right' : parseFloat((beginVolRight + currentVolRight).toFixed(2)),
        'paid-dt-volume-left' : paid,
        'paid-dt-volume-right' : paid,
        'volume-subject-to-cap-left' : volCapLeft,
        'volume-subject-to-cap-right' : volCapRight,
        'end-dt-volume-left' : endVolLeft,
        'end-dt-volume-right' : endVolRight,
        'total-dt-commissions-global' : dualteamBonus,
        'total-dt-commissions-local' :  parseFloat((dualteamBonus * exchangeRate).toFixed(2)),
		'exchange-rate' : exchangeRate
    };

    if (row.retail_commission_info === null) {
        result.body['retail-commissions'] = [];
    } else {
        result.body['retail-commissions'] = getRetailCommissions(row.retail_commission_info);
    }

    if (row.fasttrack_earning_info === null) {
        result.body['fast-track-commissions'] = [];
    } else {
        result.body['fast-track-commissions'] = getFastTrackCommissions(row.fasttrack_earning_info);
    }

    if ((bonusBeforeCap > 0) && (bonusBeforeCap !== dualteamBonus)) {
        result.body.pgdtv = pgdtv;
		result.body['max-commission'] = row.bonus_cap;
		result.body['earning-before-dt-cap'] = row.bonus_no_cap;
        if ((0.15 * pgdtv) < (payout * 0.1)) {
            result.body['10-percent-payout'] = parseFloat((payout * 0.1).toFixed(2));
        }
    }
    return result;
}

/**
 * Return weekly commission json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function get(request, response, next) {
    var context = request.context,
        date = request.query.date,
        commissionDao = daos.createDao('Commission', context),
        distributorId = context.user.distributorId,
        responseResult;

    async.series([
        function (callback) {
            commissionDao.isValidWeeklyDate(date, callback);
        },
        function (callback) {
            commissionDao.getWeeklyCommission(
                distributorId,
                date,
                function (error, result) {
                    if (error) {
                        callback(error);
                        return;
                    }
                    try {
                        responseResult = generateResponse(result.rows[0]);
                    } catch (exception) {
                        callback(exception);
                    }
                    callback(null);
                }
            );
        },
        function (callback) {
            commissionDao.getWeeklyFlushingPoints(
                distributorId,
                date,
                function (error, result) {
                    if (!error && (result.rows.length > 0)) {
                        responseResult.body['flushing-pt-left'] = result.rows[0].flushing_pt_left;
                        responseResult.body['flushing-pt-right'] = result.rows[0].flushing_pt_right;
                        responseResult.body['total-dt-volume-left'] = parseFloat((responseResult.body['total-dt-volume-left'] - responseResult.body['flushing-pt-left']).toFixed(2));
                        responseResult.body['total-dt-volume-right'] = parseFloat((responseResult.body['total-dt-volume-right'] - responseResult.body['flushing-pt-right']).toFixed(2));
                    } else {
                        responseResult.body['flushing-pt-left'] = 0.00;
                        responseResult.body['flushing-pt-right'] = 0.00;
                    }
                    callback(responseResult);
                }
            );
        }
    ], next);
}

module.exports = get;

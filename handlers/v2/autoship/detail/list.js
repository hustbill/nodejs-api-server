// GET /v2/autoships/details

var daos = require('../../../../daos');


function getCreditcard(creditcardInfo) {
    var creditcardInfoArray,
        numberAndExpiration,
        expiration,
        creditcard = {};

    if (!creditcardInfo) {
        return {};
    }

    creditcardInfoArray = creditcardInfo.replace(/[\(|\)|{|}]/g, '').split('",');

    if (creditcardInfoArray[0] === '') { // creditcardInfo is '{"(,10,2017)"}'
        expiration = creditcardInfoArray[1].replace(/\"/, '').split(',');
        creditcard.number = '';
        creditcard.expiration = expiration[1] + '-' + expiration[0];
    } else {   // creditcardInfo is '{"(4500****5058,5,2014)"}'
        numberAndExpiration = creditcardInfoArray[0].replace(/\"/g, '').split(',');
        creditcard.number = numberAndExpiration[0];
        creditcard.expiration = numberAndExpiration[2] + '-' + numberAndExpiration[1];
    }

    return creditcard;
}

function getItemDetails(itemDetails) {
    var result = [],
        itemDetailsArray;

    itemDetails.split(/\)\",/).forEach(function (item) {
        itemDetailsArray = item.replace(/\(|\)|\{|\}|"|\\/g, '').split(',');
        result.push(
            {
                item : itemDetailsArray[0],
                'item-name' : itemDetailsArray[1],
                quantity : itemDetailsArray[2],
                'personal-volume' : itemDetailsArray[3],
                'qualification-volume' : itemDetailsArray[4],
                'sale-price' : itemDetailsArray[5]
            }
        );
    });
    return result;
}

/**
 * convert the database result rows into response object.
 *
 * @method generateResponse
 * @param request {Request} express request object.
 * @param callback {Function} callback function.
 */
function generateResponse(rows) {
    var result = { statusCode : 200, body : []},
        creditcard;

    rows.forEach(function (row) {
        creditcard = getCreditcard(row.credit_card_info);
        result.body.push(
            {
                'ship-to' : row.ship_to,
                'autoship-date' : row.autoship_date,
                creditcard : creditcard.number,
                'creditcard-expiration' : creditcard.expiration,
                orders : getItemDetails(row.line_items_in_authship_order)
            }
        );
    });

    return result;
}

/**
 * Return recent autoship order details json
 * @param request {Request} express request object.
 * @param response {Request} express response object.
 * @param next {Function} express next function.
 */
function list(request, response, next) {
    var context = request.context,
        autoshipDao = daos.createDao('Autoship', context),
        distributorId = context.user.distributorId,
        resultJSON;

    autoshipDao.listOrderDetails(
        distributorId,
        function (error, result) {
            if (error) {
                next(error);
                return;
            }
            try {
                resultJSON = generateResponse(result.rows);
            } catch (exception) {
                next(exception);
                return;
            }
            next(resultJSON);
        }
    );
}

module.exports = list;

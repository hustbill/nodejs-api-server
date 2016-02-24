var daos = require('../../daos');
var PaymentDao = require('../../daos/Payment');

function process(context, order, payment, callback) {
    var giftCardDao = daos.createDao('GiftCard', context),
        giftCard = payment.giftCard,
        payOptions = {
            code : giftCard.code,
            pin : giftCard.pin,
            orderId : order.id,
            amount : payment.amount
        };

    giftCardDao.payByGiftcard(payOptions, function (error) {
        var paymentState;
        if (error) {
            paymentState = 'failed';
        } else {
            paymentState = 'completed';
        }

        PaymentDao.updatePaymentState(context, payment, paymentState, null, function () {
            callback(error);
        });
    });
}

exports.process = process;

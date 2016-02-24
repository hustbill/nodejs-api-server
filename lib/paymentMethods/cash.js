var PaymentDao = require('../../daos/Payment');

function process(context, order, payment, callback) {
    PaymentDao.updatePaymentState(context, payment, 'pending', null, callback);
}

exports.process = process;

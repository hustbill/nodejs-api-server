// POST /v2/hyperwallets/accounts

var proxy = require('../proxy');

module.exports = proxy({
    method : 'POST',
    url : '/hyperwallets/accounts',
    bodyParameters : [
        'distributor-id',
        'payment-method-id'
    ]
});

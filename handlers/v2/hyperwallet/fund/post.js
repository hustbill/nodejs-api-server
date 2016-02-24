// POST /v1/hyperwallets/funds

var proxy = require('../proxy');

module.exports = proxy({
    method : 'POST',
    url : '/hyperwallets/funds',
    bodyParameters : [
        'distributor-id',
        'payment-method-id',
        'currency-code'
    ]
});

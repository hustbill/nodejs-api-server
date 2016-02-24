// GET /v1/hyperwallets/accounts/<distributor-id>?payment-method-id=<payment-method-id>

var proxy = require('../proxy');

module.exports = proxy({
    method : 'GET',
    url : '/hyperwallets/accounts/{distributor-id}?payment-method-id={payment-method-id}'
});

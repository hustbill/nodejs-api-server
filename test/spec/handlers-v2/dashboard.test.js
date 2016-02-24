var assert = require('assert');
var should = require('should');
var request = require('superagent');

var host = 'localhost';
var port = 8080;

var DEFAULT_COMPANY_CODE = "BEB";
var DEFAULT_TOKEN = "MTAwODAxOjo4MDQ6OmxlYWhqYWNrc29uNTo6bWFvNjk2NTM5OjoxNDMxMjQ2MDAxNDM0OjpabG5FbExORmpGdDZwT0JBT1FwSDhlOjpaL1NFSmVvTXpTUHpRbUhwK2lCbHJHSmVIOTE5S3k4a0tHL3R5RzdRSW80PQ==";

function generateURL(path) {
    var url = 'http://' + host + ':' + port;
    if (path) {
        url += path;
    }
    return url;
}

describe('API ', function() {

    it('GET  '+generateURL('/v2/dashboards/enrollments/customers'), function(done) {
        request
            .get(generateURL('/v2/dashboards/enrollments/customers'))
            .set("x-company-code", DEFAULT_COMPANY_CODE)
            .set("X-Authentication-Token", DEFAULT_TOKEN)
            .end(function(err, res) {
                res.status.should.be.ok;
                done();
            });
    });

    it('GET  '+generateURL('/v2/dashboards/enrollments/distributors'), function(done) {
        request
            .get(generateURL('/v2/dashboards/enrollments/distributors'))
            .set("x-company-code", DEFAULT_COMPANY_CODE)
            .set("X-Authentication-Token", DEFAULT_TOKEN)
            .end(function(err, res) {
                res.status.should.be.ok;
                done();
            });
    });

    it('GET  '+generateURL('/v2/dashboards/orders/count'), function(done) {
        request
            .get(generateURL('/v2/dashboards/orders/count'))
            .set("x-company-code", DEFAULT_COMPANY_CODE)
            .set("X-Authentication-Token", DEFAULT_TOKEN)
            .end(function(err, res) {
                res.status.should.be.ok;
                done();
            });
    });

    it('GET  '+generateURL('/v2/dashboards/active-distributors/count'), function(done) {
        request
            .get(generateURL('/v2/dashboards/active-distributors/count'))
            .set("x-company-code", DEFAULT_COMPANY_CODE)
            .set("X-Authentication-Token", DEFAULT_TOKEN)
            .end(function(err, res) {
                res.status.should.be.ok;
                done();
            });
    });

    it('GET  '+generateURL('/v2/dashboards/three-month-pv'), function(done) {
        request
            .get(generateURL('/v2/dashboards/three-month-pv'))
            .set("x-company-code", DEFAULT_COMPANY_CODE)
            .set("X-Authentication-Token", DEFAULT_TOKEN)
            .end(function(err, res) {
                res.status.should.be.ok;
                done();
            });
    });

    it.only('GET  '+generateURL('/v2/dashboards/commissions'), function(done) {
        request
            .get(generateURL('/v2/dashboards/commissions'))
            .set("x-company-code", DEFAULT_COMPANY_CODE)
            .set("X-Authentication-Token", DEFAULT_TOKEN)
            .end(function(err, res) {
                res.status.should.be.ok;
                done();
            });
    });


    it('GET  '+generateURL('/v2/dashboards/orders/recent'), function(done) {
        request
            .get(generateURL('/v2/dashboards/orders/recent'))
            .set("x-company-code", DEFAULT_COMPANY_CODE)
            .set("X-Authentication-Token", DEFAULT_TOKEN)
            .end(function(err, res) {
                res.status.should.be.ok;
                done();
            });
    });

    
});
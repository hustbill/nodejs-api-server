var moment = require('moment');
var expect = require('chai').expect;

describe('moment.js', function () {

    describe('test isValid metohd', function () {
        it('when date is not exist, it should wrok normal.', function (done) {
            var date = '2015-01-11';
            var isValid = moment(date, 'YYYY-MM-DD', true).isValid();
            expect(isValid).to.be.true;

            expect(moment('', 'YYYY-MM-DD', true)).to.equal(null);
            expect(moment(null, 'YYYY-MM-DD', true)).to.equal(null);
            expect(moment('1', 'YYYY-MM-DD', true)).to.not.equal(null);
            expect(moment('1', 'YYYY-MM-DD', true).isValid()).to.be.false;

            done(null);
        });
    });

});
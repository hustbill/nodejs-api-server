var moment = require('moment');
var MongoClient = require('mongodb').MongoClient;

function Store(options) {
    options.host = options.host || '127.0.0.1';
    options.port = options.port || 27017;
    options.name = options.name || 'og_live';

    this.url = 'mongodb://' + options.host + ':' + options.port + '/' + options.name;

}

Store.prototype.save = function (record) {
    var collectionName = this.collectionName;
    MongoClient.connect(this.url, function (error, db) {
        if (error) {
            console.log('error when connect mongodb');
            if (db) {
                db.close();
            }
            return;
        }

        var data = {
                auditable_id : record.auditableId,
                auditable_type : record.auditableType,
                user_id : record.userId,
                user_type : record.userType,
                username : record.userName,
                action : record.action,
                audited_changes : record.changes,
                version : record.version,
                comment : record.comment,
                created_at : moment().format('YYYY-MM-DD HH:mm:ss'),
                remote_address : record.remoteAddress
            };

        db.collection('audits').insert(data, {}, function () {
            db.close();
        });
    });
};

module.exports = Store;

var Sequelize = require('sequelize');
var Store = require('./store');

/*
 * @class SequelizeAudit
 * @constructor
 * @param options {Object}
 *
 * @example
 * ```
 * var audit = new SequelizeAudit('audit_dbname', 'audit_username', 'audit_password', {});
 * sequelize = audit.newSequelize('dbname', 'username', 'password', {});
 *
 * var operator = {
 *     userId : 123,
 *     userType : 'User',
 *     userName : 'Jack',
 *     remoteAddress : '127.0.0.1'
 * };
 * sequelize.auditCreate(operator, {foo : 'bar'});
 * ```
 */
function SequelizeAudit(options) {
    this.store = new Store(options);
}

function serializeValue(value) {
    var type = typeof value,
        returnValue;
    if ((type === 'number') || (type === 'boolean')) {
        returnValue = value.toString();
    } else if (!value) {
        // null, undefined, NaN, empty string
        returnValue = '';
    } else {
        returnValue = JSON.stringify(value.toString());
    }
    return returnValue;
}

/*
 * Create a new instance of sequelize
 * @method newSequelize
 * @param database {String} database name
 * @param username {String} username
 * @param password {String} password
 * @param options {Object} options for sequelize
 */
SequelizeAudit.prototype.newSequelize = function (database, username, password, options) {
    var audit = this;

    if (!options) {
        options = {};
    }

    if (!options.define) {
        options.define = {};
    }

    if (!options.define.classMethods) {
        options.define.classMethods = {};
    }

    if (!options.define.instanceMethods) {
        options.define.instanceMethods = {};
    }

    options.define.classMethods.auditCreate = function (operator, values, fields) {
        return this.build(values).auditSave(operator, fields);
    };

    options.define.instanceMethods.auditUpdateAttributes = function (operator, updates, fields) {
        this.setAttributes(updates);
        return this.auditSave(operator, fields);
    };

    options.define.instanceMethods.auditSave = function (operator, fields) {
        var self = this,
            isNewRecord = this.isNewRecord,
            updatedAtAttr = this.daoFactory.options.underscored ? 'updated_at' : 'updatedAt',
            createdAtAttr = this.daoFactory.options.underscored ? 'created_at' : 'createdAt',
            originalAuditValues = {},
            attributesAudited = this.daoFactory.options.attributesAudited || Object.keys(this.daoFactory.rawAttributes),
            query = null;

        attributesAudited.forEach(function (key) {
            if (self.selectedValues[key] !== self[key]) {
                originalAuditValues[key] = self.selectedValues[key];
            }
        });
        originalAuditValues[updatedAtAttr] = this[updatedAtAttr];

        query = this.save(fields);
        query.success(function (savedModel) {
            var auditRecord = {
                    auditableId : savedModel.id,
                    auditableType : savedModel.daoFactory.name,
                    action : isNewRecord ? 'Create' : 'Update',
                    userId : operator.userId,
                    userType : operator.userType,
                    userName : operator.userName,
                    remoteAddress : operator.remoteAddress,
                    comment : operator.comment,
                    changes : ''
                },
                auditChanges = '--- \n';

            attributesAudited.forEach(function (key) {
                if (isNewRecord) {
                    if (key === createdAtAttr) {
                        return;
                    }
                } else {
                    if (key === 'id' ||
                            key === updatedAtAttr ||
                            !originalAuditValues.hasOwnProperty(key)) {
                        return;
                    }
                }

                var savedValue = savedModel[key],
                    originalValue = originalAuditValues[key];

                if ((savedValue instanceof Date) && (originalValue instanceof Date)) {
                    if (savedValue.getTime() === originalValue.getTime()) {
                        return;
                    }
                } else if (savedValue === originalValue) {
                    return;
                }

                auditChanges += key + ' :\n';
                if (isNewRecord) {
                    auditChanges += '-\n';
                } else {
                    auditChanges += '- ' + serializeValue(originalValue) + '\n';
                }

                auditChanges += '- ' + serializeValue(savedValue) + '\n';
            });

            auditRecord.changes = auditChanges;
            audit.store.save(auditRecord);
        });
        return query;
    };

    return new Sequelize(database, username, password, options);
};

module.exports = SequelizeAudit;

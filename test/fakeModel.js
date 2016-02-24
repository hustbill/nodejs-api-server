/**
 * The fake sequelize model used for testing.
 *
 * options = {
 *    name : <name of the model>
 *    findResult : <result of find success>
 *    errorOnFind : <if error happens when calling find()>
 * }
 *
 * @method FakeModel
 * @param options {Object}.
 */
function FakeModel(options) {
    this.modelName = options.modelName;
    this.findResult = options.findResult;
    this.errorOnFind = options.errorOnFind;
}

FakeModel.prototype.find = function (id) {
    var me = this,
        handlers = {},
        doAction = function () {
            if (handlers.done) {
                handlers.done(me.errorOnFind, me.findResult);
            }

            if (me.errorOnFind) {
                if (handlers.error) {
                    handlers.error(me.errorOnFind);
                }
            } else {
                if (handlers.success) {
                    handlers.success(me.findResult || null);
                }
            }
        };

    process.nextTick(function () {
        doAction();
    });

    return {
        done : function (callback) {
            handlers.done = callback;
            return this;
        },

        success : function (callback) {
            handlers.success = callback;
            return this;
        },

        error : function (callback) {
            handlers.error = callback;
            return this;
        }
    };
};

module.exports = FakeModel;

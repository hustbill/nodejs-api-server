function LazyLoader() {
    this.state = 'wait';
    this.callbacks = [];
}

LazyLoader.prototype.load = function (loader, callback) {
    if (this.state === 'loaded') {
        callback(null, this.result);
        return;
    }

    this.callbacks.push(callback);
    if (this.state === 'loading') {
        return;
    }
    this.state = 'loading';

    var self = this;
    loader(function (error, result) {
        var callbacks = self.callbacks;
        self.callbacks = [];

        if (error) {
            self.state = 'wait';
            callbacks.forEach(function (eachCallback) {
                eachCallback(error);
            });
            return;
        }

        self.result = result;
        self.state = 'loaded';
        callbacks.forEach(function (eachCallback) {
            eachCallback(null, result);
        });
    });
};

module.exports = LazyLoader;

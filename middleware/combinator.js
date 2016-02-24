function or() {
    var middlewares = Array.prototype.slice.call(arguments, 0);

    return function (req, res, next) {
        function check(index) {
            middlewares[index](req, res, function (err) {
                if (err) {
                    // if error happened
                    if (index < middlewares.length - 1) {
                        // check the next middleware
                        check(index + 1);
                    } else {
                        // pass error to the next handler if this is the last middleware
                        next(err);
                    }
                } else {
                    // ignore rest middlewares and call next handler immediately if no error happened
                    next();
                }
            });
        }

        // check the first middleware
        check(0);
    };
}

exports.or = or;

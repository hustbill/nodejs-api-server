function setCommissionTypes(context) {
    var input = context.input,
        types = context.input.types;

    if (types) {
        types = types.toLowerCase();
        input.generation = (types.indexOf('generation') !== -1);
        input.unilevel = (types.indexOf('unilevel') !== -1);
        input.unilevelMatch = (types.indexOf('unilevel-match') !== -1);
    }
}

function validateCommissionTypes(context) {
    var error = null,
        input = context.input;

    if ((input.generation || input.unilevel || input.unilevelMatch) === false) {
        error = new Error("Monthly commission type is empty.");
        error.statusCode = 400;
    }

    return error;
}

exports.setCommissionTypes = setCommissionTypes;
exports.validateCommissionTypes = validateCommissionTypes;

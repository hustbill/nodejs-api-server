function setOrganizationTypes(context) {
    var input = context.input,
        types = context.input.types;

    if (types) {
        types = types.toLowerCase();
        input.dualteam = (types.indexOf('dualteam') !== -1);
        input.unilevel = (types.indexOf('unilevel') !== -1);
    }
}

function validateOrganizationTypes(context) {
    var error = null,
        input = context.input;

    if ((input.dualteam || input.unilevel) === false) {
        error = new Error("Report organization type is empty.");
        error.statusCode = 400;
    }

    return error;
}

exports.setOrganizationTypes = setOrganizationTypes;
exports.validateOrganizationTypes = validateOrganizationTypes;

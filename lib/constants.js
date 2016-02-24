var RANK_NAME_MAP = {
    undefined: [''],
    null: [''],
    '-2': [''],
    '0': [''],
    '':  [''],
    10:  ['New Customer'],
    20:  ['Retail Customer'],
    30:  ['Preferred Customer'],
    40:  ['Member'],
    50:  ['Promoter'],
    60:  ['Manager'],
    70:  ['Supervisor'],
    80:  ['Gold'],
    90:  ['Ruby'],
    100: ['Emerald'],
    110: ['Diamond'],
    120: ['Exec. Diamond'],
    130: ['VP'],
    140: ['Senior VP']
};

function getRank(rank) {
    return RANK_NAME_MAP[rank][0];
}

function getRankNumberByName(name) {
    var key,
        names;
    for (key in RANK_NAME_MAP) {
        names = RANK_NAME_MAP[key];

        if (names.indexOf(name) !== -1) {
            return parseInt(key, 10) || 0;
        }
    }

    return 0;
}

exports.getRank = getRank;
exports.getRankNumberByName = getRankNumberByName;

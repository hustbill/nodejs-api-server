var LETTERS = 'abcdefghijklmnopqrstuvwxyz';
var NUMBERS = '01234567890';
var LETTERS_AND_NUMBERS = LETTERS + NUMBERS;

function randomNumber(max) {
    return Math.floor(Math.random() * (max + 1));
}

function randomText(length, seeds) {
    var s = '',
        i;

    if (!seeds) {
        seeds = LETTERS;
    }

    for (i = 0; i < length; i += 1) {
        s += seeds[randomNumber(seeds.length - 1)];
    }
    return s;
}

exports.number = randomNumber;
exports.text = randomText;
exports.seedLetters = LETTERS;
exports.seedNumbers = NUMBERS;
exports.seedLettersAndNumbers = LETTERS_AND_NUMBERS;

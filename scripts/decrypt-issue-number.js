// Decrypt the encrypted issue number of creditcard.
var Creditcard = require('../daos/Creditcard');
var encryptedIssueNumber = process.argv[process.argv.length - 1];

if (encryptedIssueNumber === __filename ||
        encryptedIssueNumber === '-h' ||
        encryptedIssueNumber === '--help') {
    console.log('usage: node decrypt-issue-number.js <encrypted-issue-number>');
    console.log('<decrypted-issue-number> can not be empty.');
} else {
    var issueNumber = Creditcard.decryptIssueNumber(encryptedIssueNumber);
    console.log(issueNumber);
}

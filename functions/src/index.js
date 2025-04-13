const mpesaFunctions = require('./mpesa');

exports.getAccessToken = mpesaFunctions.getAccessToken;
exports.initiateSTKPush = mpesaFunctions.initiateSTKPush;
exports.mpesaCallback = mpesaFunctions.mpesaCallback;
exports.queryTransactionStatus = mpesaFunctions.queryTransactionStatus;

// shared/utils/index.js
module.exports = {
    logger: require('../../utils/logger'),
    jwt: require('../../utils/jwt'),
    ledgerService: require('../../utils/ledgerService'),
    notifyService: require('../../utils/notify'),
    pdfGenerator: require('../../utils/pdfGenerator'),
    rentCalculator: require('../../utils/rent'),
    currency: require('./currency'),
};

const TranslationExport = require('../models').TranslationExport;

const BaseHandler = require('./BaseHandler');

class TranslationExportHandler extends BaseHandler {
    constructor() {
        super(TranslationExport);
    }
}

module.exports = new TranslationExportHandler();
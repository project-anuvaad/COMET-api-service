const translationExportHandler = require('../../dbHandlers/translationExport');
const BaseService = require('../BaseService');

class TranslationExportService extends BaseService {
    constructor() {
        super(translationExportHandler);
    }
}

module.exports =  new TranslationExportService();
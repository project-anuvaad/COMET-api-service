const apiKeyHandler = require('../../dbHandlers/apiKey');
const BaseService = require('../BaseService');
const uuid = require('uuid').v4;

class ApiKeyService extends BaseService {
    constructor() {
        super(apiKeyHandler);
    }

    generateApiKey() {
        return new Promise((resolve) => {
            resolve(`${uuid()}-${Date.now()}-${uuid()}`);
        })
    }

}

module.exports = new ApiKeyService();
const ApiKeyModel = require('../models').ApiKey;

const BaseHandler = require('./BaseHandler');

class ApiKeyHandler extends BaseHandler {
    constructor() {
        super(ApiKeyModel);
    }
}

module.exports = new ApiKeyHandler();
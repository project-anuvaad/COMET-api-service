const apiDocsSubscriberHandler = require('../../dbHandlers/apiDocsSubscriber');
const BaseService = require('../BaseService');

class ApiDocsSubscriberService extends BaseService {
    constructor() {
        super(apiDocsSubscriberHandler);
    }

}

module.exports = new ApiDocsSubscriberService();
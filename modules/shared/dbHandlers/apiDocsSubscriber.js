const ApiDocsSubscriberModel = require('../models').ApiDocsSubscriber;

const BaseHandler = require('./BaseHandler');

class ApiDocsSubscriberHandler extends BaseHandler {
    constructor() {
        super(ApiDocsSubscriberModel);
    }
}

module.exports = new ApiDocsSubscriberHandler();
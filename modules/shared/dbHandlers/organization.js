const { Organization } = require('../models')
const BaseHandler = require('./BaseHandler');

class OrganizationHandler extends BaseHandler {
    constructor() {
        super(Organization);
    }
}

module.exports = new OrganizationHandler();
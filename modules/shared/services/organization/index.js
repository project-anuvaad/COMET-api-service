const organizationHandler = require('../../dbHandlers/organization');
const BaseService = require('../BaseService');

class OrganizationService extends BaseService {
    constructor() {
        super(organizationHandler);
    }

}

module.exports = new OrganizationService();
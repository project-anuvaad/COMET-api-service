const folderHandler = require('../../dbHandlers/folder');

const BaseService = require('../BaseService');

class folderService extends BaseService {
    constructor() {
        super(folderHandler);
    }
}


module.exports = new folderService();

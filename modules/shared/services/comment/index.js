const folderHandler = require('../../dbHandlers/folder');

const BaseService = require('../BaseService');

class FolderService extends BaseService {
    constructor() {
        super(folderHandler);
    }
}


module.exports = new FolderService();

const FolderModel = require('../models').Folder;
const BaseHandler = require('./BaseHandler');

class FolderHandler extends BaseHandler {

    constructor() {
        super(FolderModel);
    }

}

module.exports = new FolderHandler();
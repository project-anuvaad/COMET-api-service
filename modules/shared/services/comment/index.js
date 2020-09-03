const commentHandler = require('../../dbHandlers/comment');

const BaseService = require('../BaseService');

class commentService extends BaseService {
    constructor() {
        super(commentHandler);
    }
}


module.exports = new commentService();

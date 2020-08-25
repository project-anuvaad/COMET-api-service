const commentHandler = require('../../dbHandlers/comment');

const BaseService = require('../BaseService');

class CommentService extends BaseService {
    constructor() {
        super(commentHandler);
    }
}


module.exports = new CommentService();

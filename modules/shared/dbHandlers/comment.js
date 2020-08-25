const CommentModel = require('../models').Comment;
const BaseHandler = require('./BaseHandler');

class CommentHandler extends BaseHandler {

    constructor() {
        super(CommentModel);
    }

}

module.exports = new CommentHandler();
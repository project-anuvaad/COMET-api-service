const ArticleModel = require('../models').Article;
const BaseHandler = require('./BaseHandler');

class ArticleHandler extends BaseHandler {
    constructor() {
        super(ArticleModel);
    }
}

module.exports = new ArticleHandler();

const { User } = require('../models');

const BaseHandler = require('./BaseHandler');

class UserHandler extends BaseHandler {
    constructor() {
        super(User);
    }

}

module.exports = new UserHandler();
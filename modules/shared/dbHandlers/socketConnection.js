const { SocketConnection } = require('../models');

const BaseHandler = require('./BaseHandler');

class SocketConnectionHandler extends BaseHandler {
    constructor() {
        super(SocketConnection);
    }
}
module.exports = new SocketConnectionHandler();
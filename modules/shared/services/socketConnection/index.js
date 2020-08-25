const socketConnetionHandler = require('../../dbHandlers/socketConnection');
const BaseService = require('../BaseService');

class SocketConnectionService extends BaseService {
    constructor() {
        super(socketConnetionHandler);
    }
}
module.exports = new SocketConnectionService();
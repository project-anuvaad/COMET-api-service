const NotificationModel = require('../models').Notification;

const BaseHandler = require('./BaseHandler');

class NotificationHandler extends BaseHandler {
    constructor() {
        super(NotificationModel);
    }
}


module.exports = new NotificationHandler();

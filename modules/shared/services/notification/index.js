const notificationHandler = require("../../dbHandlers/notification");

const websockets = require("../websockets");

const BaseService = require("../BaseService");

class NotificationService extends BaseService {
  constructor() {
    super(notificationHandler);
  }

  notifyUser({ email, _id, organization }, data) {
    return new Promise((resolve, reject) => {
      let notificationDoc;
      this.create(data)
        .then((n) => {
          notificationDoc = n.toObject();
          if (email) {
            this.websockets.emitEvent({
              email,
              event: "NEW_NOTIFICATION",
              data: { notification: notificationDoc },
            });
          } else if (_id) {
            websockets.emitEvent({
              _id,
              event: "NEW_NOTIFICATION",
              data: { notification: notificationDoc },
            });
          }
          resolve(notificationDoc);
        })
        .catch(reject);
    });
  }
}

module.exports = new NotificationService();

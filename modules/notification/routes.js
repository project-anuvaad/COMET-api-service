const controller = require("./controller");
// external modules should call the mount function and pass it an instance
// of the router to add the module's routes to it
const mount = function (router) {
  // Define module routes here
  router.get("/", controller.getNotifications);
  router.get("/unread/count", controller.getUnreadCount);

  router.post("/read", controller.setNotificationsRead);

  return router;
};

module.exports = {
  mount,
};

// external modules should call the mount function and pass it an instance
// of the router to add the module's routes to it
const mount = function (router, rabbitmqChannel) {
  // Define module routes here
  const workers = require("./workers")({ rabbitmqChannel });
  const controller = require("./controller")({ workers });

  require("./rabbitmqHandlers").init({ channel: rabbitmqChannel, workers });

  router.get("/", controller.get);
  router.post("/", controller.createImageTranslationExport);

  return router;
};

module.exports = {
  mount,
};

const controller = require('./controller');

// external modules should call the mount function and pass it an instance
// of the router to add the module's routes to it
const mount = function (router, rabbitmqChannel) {
  // Define module routes here

  require("./rabbitmqHandlers").init({ channel: rabbitmqChannel });

  router.get("/by_article_id/:articleId", controller.getArticleComments);
  router.post("/", controller.addCommet);

  return router;
};

module.exports = {
  mount,
};

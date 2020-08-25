
// external modules should call the mount function and pass it an instance
// of the router to add the module's routes to it
const mount = function (router, rabbitmqChannel) {
  // Define module routes here
  const workers = require("./workers")({ rabbitmqChannel });
  const controller = require("./controller")({ workers });
  router.get("/by_article_id/:id", controller.getByArticleId);
  router.post("/:id/subtitles", controller.addSubtitle);

  // TODO: DOC THIS
  router.post("/:id/activated", controller.activateSubtitles);

  // TODO: DOC THIS
  router.post("/:id/subtitles/combine", controller.combineSubtitle);

  router.post("/:id/subtitles/:subtitlePosition/split", controller.splitSubtitle);
  router.patch("/:id/subtitles/:subtitlePosition", controller.updateSubtitle);
  router.delete("/:id/subtitles/:subtitlePosition", controller.deleteSubtitle);

  router.post("/:id/reset", controller.resetSubtitles);
  router.get("/:id", controller.getById);

  return router;
};

module.exports = {
  mount,
};

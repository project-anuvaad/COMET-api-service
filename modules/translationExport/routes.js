const middlewares = require("./middlewares");

// external modules should call the mount function and pass it an instance
// of the router to add the module's routes to it
const mount = function (router, rabbitmqChannel) {
  // Define module routes here

  const workers = require("./workers")({ rabbitmqChannel });
  const controller = require("./controller")({ workers });

  require("./rabbitmqHandlers").init(rabbitmqChannel);

  router.get("/by_article_id/:articleId", controller.getByArticleId);

  router.post(
    "/requestExport",
    middlewares.authorizeRequestExport,
    controller.exportTranslationRequest
  );
  router.post(
    "/requestExportMultiple",
    middlewares.authorizeRequestExportMultiple,
    controller.exportMultipleTranslationRequest
  );
  router.post(
    "/:translationExportId/approve",
    middlewares.authorizeApproveAndDecline,
    controller.approveTranslationExport
  );
  router.post(
    "/:translationExportId/decline",
    middlewares.authorizeApproveAndDecline,
    controller.declineTranslationExport
  );
  router.post(
    "/:translationExportId/audios/generateArchive",
    middlewares.validateArchiveAudios,
    controller.archiveAudios
  );
  router.post(
    "/:translationExportId/video/subtitles",
    middlewares.validateGenerateSubtitles,
    controller.generateVideoSubtitle
  );
  router.post(
    "/:translationExportId/video/burnSubtitles",
    middlewares.validateBurnSubtitles,
    controller.burnVideoSubtitle
  );
  router.post(
    "/:translationExportId/video/burnSubtitlesSignlanguage",
    controller.burnVideoSubtitleAndSignlanguage
  );
  router.put(
    "/:translationExportId/audioSettings",
    middlewares.authorizeApproveAndDecline,
    controller.updateAudioSettings
  );

  return router;
};

module.exports = {
  mount,
};

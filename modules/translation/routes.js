const middlewares = require("./middlewares");
const multer = require("multer");
const fs = require("fs");
const requiredDirs = ["tmp", "./tmp"];

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "/tmp");
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname +
        "-" +
        Date.now() +
        "." +
        file.originalname.split(".").pop()
    );
  },
});
var upload = multer({ storage: storage });

requiredDirs.forEach((d) => {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d);
  }
});
// external modules should call the mount function and pass it an instance
// of the router to add the module's routes to it
const mount = function (router, rabbitmqChannel) {
  // Define module routes here

  const workers = require("./workers")({ rabbitmqChannel });
  const controller = require("./controller")({ workers });

  require("./rabbitmqHandlers").init({ channel: rabbitmqChannel, workers });

  router.post(
    "/:articleId/picInPic",
    upload.single("file"),
    middlewares.authorizeTranslationUpdate,
    controller.addPictureInPicture
  );
  router.patch(
    "/:articleId/picInPic/position",
    middlewares.authorizeTranslationUpdate,
    controller.updatePictureInPicturePosition
  );

  router.put(
    "/:articleId/stage/text_translation_done",
    controller.setStageToTextTranslationDone
  );
  router.put(
    "/:articleId/stage/voice_over_translation",
    controller.setStageToVoiceoverTranslation
  );
  router.put(
    "/:articleId/stage/voice_over_translation_done",
    controller.setStageToVoiceoverTranslationDone
  );
  router.put("/:articleId/stage/done", controller.setStageToDone);

  router.post(
    "/:articleId/time",
    middlewares.authorizeTranslationUpdate,
    controller.updateSubslideTiming
  );
  router.post(
    "/:articleId/text",
    middlewares.authorizeTranslationUpdate,
    controller.addTranslatedText
  );
  router.post(
    "/:articleId/text/replace",
    middlewares.authorizeTranslationUpdate,
    controller.replaceTranslatedText
  );

  router.post(
    "/:articleId/audio",
    upload.single("file"),
    middlewares.authorizeTranslationUpdate,
    controller.addRecordedAudio
  );
  router.post(
    "/:articleId/audio/tts",
    middlewares.authorizeTranslationUpdate,
    controller.generateTTSAudio
  );
  router.post(
    "/:articleId/audio/original",
    middlewares.authorizeTranslationUpdate,
    controller.updateAudioFromOriginal
  );

  router.delete(
    "/:articleId/audio",
    middlewares.authorizeTranslationUpdate,
    controller.deleteRecordedAudio
  );

  router.post("/:articleId/videoSpeed", controller.updateVideoSpeed);
  router.post("/:articleId/audioSpeed", controller.updateAudioSpeed);
  router.post("/:articleId", controller.generateTranslatableArticle);

  router.post(
    "/:articleId/translationVersions/setTranslationVersionForAllSubslides",
    controller.setTranslationVersionForAllSubslides
  );
  router.post(
    "/:articleId/translationVersions/setTranslationVersionForSubslide",
    controller.setTranslationVersionForSubslide
  );
  router.get("/:articleId/translationVersions", controller.getTranslationVersion);
  router.get(
    "/:articleId/translationVersions/count",
    controller.getTranslationVersionCount
  );

  router.get("/:articleId/languages", controller.getTranslatableArticleLangs);
  // TODO: DOC THIS
  router.get("/:articleId", controller.getTranslatableArticle);

  return router;
};

module.exports = {
  mount,
};

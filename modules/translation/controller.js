const uuid = require("uuid").v4;
const async = require("async");
const fs = require("fs");
const {
  storageService,
  articleService,
  videoService,
  userService,
  websocketsService,
} = require("../shared/services");

const websocketsEvents  =require('../shared/services/websockets/websockets/events');
const websocketsRooms = require('../shared/services/websockets/websockets/rooms')

const fileUtils = require("./fileUtils");
const {
  TRANSLATION_AUDIO_DIRECTORY,
  PICTURE_IN_PICTURE_DIRECTORY,
} = require("./constants");

function getArticleLanguage(article) {
  const langObj = {};
  if (article.langCode) {
    langObj.langCode = article.langCode;
  }
  if (article.langName) {
    langObj.langName = article.langName;
  }
  if (article.tts) {
    langObj.tts = true;
  }
  return langObj;
}

function isArticleCompleted(article) {
  const slides = article.slides
    .reduce((acc, s) => acc.concat(s.content), [])
    .filter((s) => s.speakerProfile && s.speakerProfile.speakerNumber !== -1);
  return slides.every((s) => s.audio && s.text);
}

const controller = ({ workers }) => {
  const { exporterWorker, translationWorker } = workers;

  const utils = require("./utils")({ workers });

  return {
    generateTranslatableArticle: function (req, res) {
      const { articleId } = req.params;
      const { lang, tts, signLang } = req.body;
      let { langName } = req.body;
      if (!langName) {
        langName = "";
      }
      if (!lang && !langName) {
        return res
          .status(400)
          .send("Please choose language code or language name");
      }
      articleService
        .generateTranslatableArticle({
          articleId,
          lang,
          signLang,
          langName,
          tts,
          createdBy: req.user._id,
        })
        .then(({ article, originalArticle, created }) => {
          if (created) {
            translationWorker.translateArticleText({
              articleId: article._id,
              lang,
            });
          }
          if (article.video) {
            videoService
              .findById(article.video)
              .then((video) => {
                if (video.projectLeaders && video.projectLeaders.length > 0) {
                  return articleService.findByIdAndUpdate(article._id, {
                    projectLeaders: video.projectLeaders.map((user) => ({
                      user,
                      invitationStatus: "accepted",
                      invitedBy: req.user._id,
                    })),
                  });
                }
              })
              .catch((err) => {
                console.log(err);
              });
          }
          return res.json({ article, originalArticle });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    getTranslationVersion: function (req, res) {
      const { articleId } = req.params;
      articleService
        .findById(articleId)
        .then((article) => {
          if (!article) throw new Error("Invalid article id");
          return articleService.find({
            translationArticle: articleId,
            articleType: "translation_version",
          });
        })
        .then((articles) => {
          return res.json({
            articles: articles.map((a) =>
              articleService.cleanArticleSilentAndBackgroundMusicSlides(a)
            ),
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    getTranslationVersionCount: function (req, res) {
      const { articleId } = req.params;
      articleService
        .findById(articleId)
        .then((article) => {
          if (!article) throw new Error("Invalid article id");
          return articleService.count({
            translationArticle: articleId,
            articleType: "translation_version",
          });
        })
        .then((count) => {
          return res.json({ count });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    setTranslationVersionForSubslide: function (req, res) {
      const { articleId } = req.params;
      let {
        slidePosition,
        subslidePosition,
        translationVersionArticleId,
      } = req.body;
      let translationArticle;
      let translationVersion;
      let subslide;

      slidePosition = parseInt(slidePosition);
      subslidePosition = parseInt(subslidePosition);
      articleService
        .findById(articleId)
        .then((t) => {
          translationArticle = t;
          subslide = translationArticle.slides
            .find((s) => s.position === slidePosition)
            .content.find((s) => s.position === subslidePosition);
          return articleService.findById(translationVersionArticleId);
        })
        .then((tt) => {
          translationVersion = tt;
          const versionSubslide = translationVersion.slides
            .find((s) => s.position === slidePosition)
            .content.find((s) => s.position === subslidePosition);
          subslide.text = versionSubslide.text;
          subslide.translationVersionArticleId = translationVersionArticleId;

          return articleService.updateSubslideUsingPosition(
            articleId,
            slidePosition,
            subslidePosition,
            {
              text: subslide.text,
              translationVersionArticleId: subslide.translationVersionArticleId,
            }
          );
        })
        .then(() => {
          return res.json({ subslide, slidePosition, subslidePosition });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },
    setTranslationVersionForAllSubslides: function (req, res) {
      const { articleId } = req.params;
      let { translationVersionArticleId } = req.body;
      let translationArticle;
      let translationVersion;

      articleService
        .findById(articleId)
        .then((t) => {
          translationArticle = articleService.cleanArticleSilentAndBackgroundMusicSlides(
            t
          );
          return articleService.findById(translationVersionArticleId);
        })
        .then((tt) => {
          return new Promise((resolve) => {
            translationVersion = articleService.cleanArticleSilentAndBackgroundMusicSlides(
              tt
            );
            const updateFuncArray = [];
            const subslides = translationArticle.slides.reduce(
              (acc, s) =>
                s.content && s.content.length > 0
                  ? acc.concat(
                      s.content.map((ss) => ({
                        ...ss,
                        slidePosition: s.position,
                        subslidePosition: ss.position,
                      }))
                    )
                  : [],
              []
            );

            subslides.forEach((subslide) => {
              updateFuncArray.push((cb) => {
                const versionSubslide = translationVersion.slides
                  .find((s) => s.position === subslide.slidePosition)
                  .content.find(
                    (s) => s.position === subslide.subslidePosition
                  );
                articleService
                  .updateSubslideUsingPosition(
                    articleId,
                    subslide.slidePosition,
                    subslide.subslidePosition,
                    {
                      text: versionSubslide.text,
                      translationVersionArticleId: translationVersion._id,
                    }
                  )
                  .then(() => {
                    cb();
                  })
                  .catch((err) => {
                    console.log(err);
                    cb();
                  });
              });
            });

            async.parallelLimit(updateFuncArray, 10, () => {
              return resolve();
            });
          });
        })
        .then(() => articleService.findById(articleId))
        .then((article) => {
          return res.json({
            article: articleService.cleanArticleSilentAndBackgroundMusicSlides(
              article
            ),
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    addPictureInPicture: function (req, res) {
      const { file } = req;
      const { articleId } = req.params;
      let { slidePosition, subslidePosition } = req.body;
      slidePosition = parseInt(slidePosition);
      subslidePosition = parseInt(subslidePosition);
      if (!file) return res.status(400).send("Invalid file field");
      let uploadedVideoUrl;
      let article;

      const filePath = file.path;
      const fileExtension = file.mimetype.split("/").pop();
      const fileName = `video-${uuid()}.${fileExtension}`;
      let user;
      userService
        .getUserByEmail(req.user.email)
        .then((u) => {
          user = u;
          return articleService.findById(articleId);
        })
        .then((articleDoc) => {
          if (!articleDoc) throw new Error("Invalid article id");
          article = articleDoc;
          // return fileUtils.getAudioDuration(filePath);
          console.log("Getting file duration");
          return fileUtils.getFileDuration(filePath);
        })
        .then((duration) => {
          const slide = article.slides.find(
            (s) => s.position === slidePosition
          );
          const subslide = slide.content.find(
            (s) => s.position === subslidePosition
          );
          console.log("starting upload");
          console.log("duration is", duration, subslide.media[0].duration);
          if (subslide.media[0].duration < duration) {
            throw new Error(
              "Video duration should be less than or equal the video slide duration"
            );
          }
          return storageService.saveFile(
            PICTURE_IN_PICTURE_DIRECTORY,
            fileName,
            fs.createReadStream(filePath)
          );
        })
        .then((uploadRes) => {
          console.log("uploaded pic in pic", uploadRes);
          uploadedVideoUrl = uploadRes.url;
          // Delete previous picInPic if exists
          const slide = article.slides.find(
            (s) => s.position === slidePosition
          );
          const subslide = slide.content.find(
            (s) => s.position === subslidePosition
          );
          if (subslide.picInPicVideoUrl && subslide.picInPicFileName) {
            console.log(
              "supposed to be deleting",
              PICTURE_IN_PICTURE_DIRECTORY,
              subslide.picInPicFileName
            );
            // storageService.deleteFile(PICTURE_IN_PICTURE_DIRECTORY, subslide.picInPicFileName)
            //     .then(() => {
            //         console.log('deleted file');
            //     })
            //     .catch((err) => {
            //         console.log('error deleting file', err);
            //     });
          }

          const articleUpdate = {
            picInPicVideoUrl: uploadRes.url,
            picInPicKey: uploadRes.data.Key,
            picInPicFileName: fileName,
            picInPicUser: user._id,
          };
          return articleService.updateSubslideUsingPosition(
            articleId,
            slidePosition,
            subslidePosition,
            articleUpdate
          );
        })
        .then(() => {
          // audioProcessor.processRecordedAudio({ articleId, slidePosition, subslidePosition });

          // websocketsService.ioEmitter.to(websocketsRooms.getOrganizationRoom(article.organization)).emit(`${events.TRANSLATION_SUBSLIDE_CHANGE}/${articleId}`, { slidePosition, subslidePosition, changes: { picInPicVideoUrl: uploadedVideoUrl } });
          return res.json({
            picInPicVideoUrl: uploadedVideoUrl,
            slidePosition,
            subslidePosition,
            audioSynced: true,
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message || "Something went wrong");
        });
    },

    updatePictureInPicturePosition: function (req, res) {
      const { articleId } = req.params;
      let { slidePosition, subslidePosition, picInPicPosition } = req.body;
      slidePosition = parseInt(slidePosition);
      subslidePosition = parseInt(subslidePosition);
      articleService
        .updateSubslideUsingPosition(
          articleId,
          slidePosition,
          subslidePosition,
          {
            picInPicPosition,
          }
        )
        .then(() => {
          return res.json({
            slidePosition,
            subslidePosition,
            picInPicPosition,
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message || "Something went wrong");
        });
    },

    getTranslatableArticleLangs: function (req, res) {
      const { articleId } = req.params;
      let originalLanguage;
      const languages = [];
      let article;
      articleService
        .findById(articleId)
        .then((articleDoc) => {
          if (!articleDoc)
            throw new Error(
              "Oops, the video might have been deleted by the admin"
            );
          if (articleDoc.articleType !== "translation")
            return res
              .status(400)
              .send("Article id should be of a translation article");
          article = articleDoc.toObject();
          return articleService.findById(article.originalArticle);
        })
        .then((originalArticle) => {
          article.originalArticle = originalArticle.toObject();
          originalLanguage = getArticleLanguage(article.originalArticle);
          return articleService.find({
            originalArticle: article.originalArticle._id,
          });
        })
        .then((articleTranslations) => {
          articleTranslations
            .filter((t) => t._id.toString() !== articleId)
            .forEach((a) => {
              // Check if the article is already completed
              if (isArticleCompleted(a)) {
                languages.push(getArticleLanguage(a));
              }
            });
          return res.json({ languages, originalLanguage });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    getTranslatableArticle: function (req, res) {
      const { articleId } = req.params;
      const { langCode, langName, tts } = req.query;
      let article;
      articleService
        .findById(articleId)
        .then((articleDoc) => {
          if (!articleDoc)
            return res
              .status(400)
              .send("Oops, the video may have been deleted by the admin");
          article = articleDoc.toObject();
          if (article.articleType !== "translation")
            return res
              .status(400)
              .send("Article id should be of a translation article");
          return articleService.findById(article.originalArticle);
        })
        .then((originalArticle) => {
          article.originalArticle = originalArticle;
          // If neither the lang code or lang name is set
          // or the lang code/name is the same of the original article
          // give back the original article
          if (
            (!langCode && !langName) ||
            (langCode === article.originalArticle.langCode &&
              Boolean(tts) === Boolean(article.originalArticle.tts))
          ) {
            originalArticle = articleService.cleanArticleSilentAndBackgroundMusicSlides(
              article.originalArticle
            );
            article.originalArticle = article.originalArticle._id;
            return res.json({
              article: articleService.cleanArticleSilentAndBackgroundMusicSlides(
                article
              ),
              originalArticle,
            });
          }
          // Get custom base language article
          const baseArticleQuery = {
            originalArticle: article.originalArticle._id,
            langCode,
          };
          if (langName) {
            baseArticleQuery.langName = langName;
          }
          /* eslint-disable no-extra-boolean-cast */
          if (Boolean(tts)) {
            baseArticleQuery.tts = true;
          } else {
            // baseArticleQuery.tts = false;
            baseArticleQuery["$or"] = [
              { tts: false },
              { tts: { $exists: false } },
            ];
          }
          console.log("base query", baseArticleQuery);
          articleService
            .find(baseArticleQuery)
            .then((articles) => {
              if (!articles || articles.length === 0)
                throw new Error(
                  `No article with ${langCode}|${langName} as base language`
                );

              originalArticle = articleService.cleanArticleSilentAndBackgroundMusicSlides(
                articles[0].toObject()
              );
              article.originalArticle = article.originalArticle._id;
              return res.json({
                article: articleService.cleanArticleSilentAndBackgroundMusicSlides(
                  article
                ),
                originalArticle,
              });
            })
            .catch((err) => {
              console.log(err);
              return res.status(400).send(err.message);
            });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    setStageToSignlanguageTranslationDone: function (req, res) {
      const { articleId } = req.params;
      let article;

      articleService
        .findById(articleId)
        .then((a) => {
          article = a;
          // Validate article is in text_translation stage
          if (article.stage && article.stage !== "signlanguage_translation") {
            throw new Error(
              "Translation stage should be signlanguage translation to perform this action"
            );
          }
          // validate all speaker slides on the article have text in it
          const allSubslides = article.slides
            .reduce((acc, s) => (s.content ? acc.concat(s.content) : acc), [])
            .filter(
              (s) => s.speakerProfile && s.speakerProfile.speakerNumber !== -1
            );
          if (allSubslides.some((s) => !s.picInPicVideoUrl)) {
            throw new Error(
              "All Slides must have Sign language videos to move to mark text translation as done"
            );
          }
          // If the article have verifiers, inform them that the text translation is done and ready for verification
          // and move the article to text_translation_done stage
          // else if the article have voice over translators, inform them that the text translation is done
          // and move the article to voice_over_translation stage
          // else just move it to voice_over_translation stage
          if (article.verifiers && article.verifiers.length > 0) {
            utils
              .notifyVerifiersSignlanguageTranslationDone(articleId)
              .then(() => {
                console.log(
                  "Notified verifiers text translation done",
                  articleId
                );
              })
              .catch((err) => {
                console.log(
                  "error notifying verifiers text translation done",
                  err
                );
              });
          }
          let newStage = "signlanguage_translation_done";
          return articleService.updateById(articleId, { stage: newStage });
        })
        .then(() => articleService.findById(articleId))
        .then((a) => res.json({ stage: a.stage }))
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    setStageToTextTranslationDone: function (req, res) {
      const { articleId } = req.params;
      let article;

      articleService
        .findById(articleId)
        .then((a) => {
          article = a;
          // Validate article is in text_translation stage
          if (article.stage && article.stage !== "text_translation") {
            throw new Error(
              "Translation stage should be text translation to perform this action"
            );
          }
          // validate all speaker slides on the article have text in it
          const allSubslides = article.slides
            .reduce((acc, s) => (s.content ? acc.concat(s.content) : acc), [])
            .filter(
              (s) => s.speakerProfile && s.speakerProfile.speakerNumber !== -1
            );
          if (allSubslides.some((s) => !s.text || !s.text.trim())) {
            throw new Error(
              "All Slides must have text to move to mark text translation as done"
            );
          }
          // If the article have verifiers, inform them that the text translation is done and ready for verification
          // and move the article to text_translation_done stage
          // else if the article have voice over translators, inform them that the text translation is done
          // and move the article to voice_over_translation stage
          // else just move it to voice_over_translation stage
          let newStage = "";
          if (article.verifiers && article.verifiers.length > 0) {
            newStage = "text_translation_done";
            utils
              .notifyVerifiersTextTranslationDone(articleId)
              .then(() => {
                console.log(
                  "Notified verifiers text translation done",
                  articleId
                );
              })
              .catch((err) => {
                console.log(
                  "error notifying verifiers text translation done",
                  err
                );
              });
          } else if (article.translators && article.translators.length > 0) {
            newStage = "voice_over_translation";
            utils
              .notifyVoiceoverTranslatorsTranslationReadyForVoiceover(articleId)
              .then(() => {
                console.log(
                  "Notified voiceover translators translation ready for voiceover",
                  articleId
                );
              })
              .catch((err) => {
                console.log(
                  "error notifying voiceover translators translation ready for voiceover ",
                  err
                );
              });
          } else {
            newStage = "voice_over_translation";
          }
          return articleService.updateById(articleId, { stage: newStage });
        })
        .then(() => articleService.findById(articleId))
        .then((a) => res.json({ stage: a.stage }))
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    setStageToVoiceoverTranslation: function (req, res) {
      const { articleId } = req.params;
      let article;

      articleService
        .findById(articleId)
        .then((a) => {
          article = a;
          // Validate article is in text_translation stage
          if (article.stage && article.stage !== "text_translation_done") {
            throw new Error(
              "Translation stage should be text translation done to perform this action"
            );
          }
          // validate all speaker slides on the article have text in it
          const allSubslides = article.slides
            .reduce((acc, s) => (s.content ? acc.concat(s.content) : acc), [])
            .filter(
              (s) => s.speakerProfile && s.speakerProfile.speakerNumber !== -1
            );
          if (allSubslides.some((s) => !s.text || !s.text.trim())) {
            throw new Error(
              "All Slides must have text to move to mark the approval as done"
            );
          }

          if (article.translators && article.translators.length > 0) {
            utils
              .notifyVoiceoverTranslatorsTranslationReadyForVoiceover(articleId)
              .then(() => {
                console.log("Notified translators voiceover translation ready");
              })
              .catch((err) => {
                console.log(
                  "error notifying translators voiceover translation ready",
                  err
                );
              });
          }
          let newStage = "voice_over_translation";
          return articleService.updateById(articleId, { stage: newStage });
        })
        .then(() => articleService.findById(articleId))
        .then((a) => res.json({ stage: a.stage }))
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    setStageToVoiceoverTranslationDone: function (req, res) {
      const { articleId } = req.params;
      let article;

      articleService
        .findById(articleId)
        .then((a) => {
          article = a;
          // Validate article is in text_translation stage
          if (article.stage && article.stage !== "voice_over_translation") {
            throw new Error(
              "Translation stage should be voiceover translation to perform this action"
            );
          }
          // validate all speaker slides on the article have text in it
          const allSubslides = article.slides
            .reduce((acc, s) => (s.content ? acc.concat(s.content) : acc), [])
            .filter(
              (s) => s.speakerProfile && s.speakerProfile.speakerNumber !== -1
            );
          if (allSubslides.some((s) => !s.audio)) {
            throw new Error(
              "All Slides must have audio to mark voiceover translation as done"
            );
          }
          let newStage = "";
          if (article.verifiers && article.verifiers.length > 0) {
            newStage = "voice_over_translation_done";
            utils
              .notifyVerifiersVoiceoverTranslationDone(articleId)
              .then(() => {
                console.log("notifed verifiers voiceover translation done");
              })
              .catch((err) => {
                console.log(
                  "error notifying verifiers voiceover translation done",
                  err
                );
              });
          } else {
            newStage = "done";
          }
          return articleService.updateById(articleId, { stage: newStage });
        })
        .then(() => articleService.findById(articleId))
        .then((a) => res.json({ stage: a.stage }))
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    setStageToDone: function (req, res) {
      const { articleId } = req.params;
      let article;

      articleService
        .findById(articleId)
        .then((a) => {
          article = a;
          // Validate article is in text_translation stage
          if (
            article.stage &&
            article.stage !== "voice_over_translation_done" &&
            article.stage !== "signlanguage_translation_done"
          ) {
            throw new Error(
              "Translation stage should be voiceover translation done or sign language translation done to perform this action"
            );
          }
          // validate all speaker slides on the article have text in it
          const allSubslides = article.slides
            .reduce((acc, s) => (s.content ? acc.concat(s.content) : acc), [])
            .filter(
              (s) => s.speakerProfile && s.speakerProfile.speakerNumber !== -1
            );
          if (allSubslides.some((s) => !s.audio)) {
            throw new Error(
              "All Slides must have audio to mark approving voiceover translation as done"
            );
          }
          let newStage = "done";
          return articleService.updateById(articleId, { stage: newStage });
        })
        .then(() => articleService.findById(articleId))
        .then((a) => res.json({ stage: a.stage }))
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    addTranslatedText: function (req, res) {
      const { articleId } = req.params;
      const { slidePosition, subslidePosition, text } = req.body;
      articleService
        .updateSubslideUsingPosition(
          articleId,
          slidePosition,
          subslidePosition,
          {
            text,
            audioSynced: false,
            translationVersionArticleId: null,
          }
        )
        .then((article) => {
          websocketsService.emitEvent({
            room: websocketsRooms.getOrganizationRoom(article.organization),
            event: `${websocketsEvents.TRANSLATION_SUBSLIDE_CHANGE}/${articleId}`,
            data: {
              slidePosition,
              subslidePosition,
              changes: { text, audioSynced: false },
            },
          });
          return res.json({
            text,
            slidePosition,
            subslidePosition,
            audioSynced: false,
            translationVersionArticleId: null,
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        })
        .then(() => {
          articleService
            .update({ _id: articleId }, { exported: false })
            .then(() => {})
            .catch((err) => {
              console.log("error updating article exported", err);
            });
        });
    },

    updateSubslideTiming: function (req, res) {
      const {
        slidePosition,
        subslidePosition,
        startTime,
        endTime,
      } = req.body;
      const { articleId } = req.params;

      let article;
      articleService
        .findById(articleId)
        .then((a) => {
          if (!a) throw new Error("Invalid article id " + articleId);
          article = a;
          const slide = article.slides.find(
            (s) => s.position === parseInt(slidePosition)
          );
          if (!slide)
            throw new Error("Invalid Slide Position " + slidePosition);
          const subslide = slide.content.find(
            (s) => s.position === parseInt(subslidePosition)
          );
          if (!subslide)
            throw new Error("Invalid subslide position " + subslidePosition);
          if (parseInt(startTime) > parseInt(endTime)) {
            throw new Error('Start time cannot be larger than end time ' + startTime + ' ' + endTime)
          }
          const otherSubslides = article.slides
            .reduce(
              (acc, s) =>
                s.content && s.content.length > 0
                  ? acc.concat(
                      s.content.map((ss) => ({
                        ...ss,
                        slidePosition: s.position,
                        subslidePosition: ss.position,
                      }))
                    )
                  : acc,
              []
            )
            .filter(
              (s) =>
                !(
                  s.slidePosition === parseInt(slidePosition) &&
                  s.subslidePosition === parseInt(subslidePosition)
                )
            );

          const collapsingSlide = otherSubslides
                                  .find(s => (s.startTime < startTime && s.endTime > startTime) || (s.startTime < endTime && s.endTime > endTime));
          if (collapsingSlide) {
            throw new Error('Start time and end time are collapsing with another slide');
          }
          return videoService.findById(article.video)
        })
        .then(video => {
          exporterWorker.updateArticleSlideVideoSlice({ id: articleId, videoUrl: video.url, slides: article.slides, slidePosition, subslidePosition, startTime, endTime })
          return articleService.findByIdAndUpdate(articleId, { videoSliceLoading: true })
        })
        .then(() => {
          return res.json({ slidePosition: parseInt(slidePosition), subslidePosition: parseInt(subslidePosition), videoSliceLoading: true });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    replaceTranslatedText: function (req, res) {
      const { articleId } = req.params;
      const { find, replace } = req.body;
      articleService
        .findById(articleId)
        .then(() => {
          return articleService.replaceArticleSlidesText(articleId, {
            find,
            replace,
          });
        })
        .then((changedSlides) => {
          changedSlides.forEach(({ slidePosition, subslidePosition, text }) => {
            websocketsService.emitEvent({
              room: websocketsRooms.getOrganizationRoom(
                articleService.organization
              ),
              event: `${websocketsEvents.TRANSLATION_SUBSLIDE_CHANGE}/${articleId}`,
              data: {
                slidePosition,
                subslidePosition,
                changes: { text, audioSynced: false },
              },
            });
          });
          return articleService.findById(articleId);
        })
        .then((article) => {
          return res.json({
            article: articleService.cleanArticleSilentAndBackgroundMusicSlides(
              article.toObject()
            ),
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        })
        .then(() => {
          articleService
            .update({ _id: articleId }, { exported: false })
            .then(() => {})
            .catch((err) => {
              console.log("error updating article exported", err);
            });
        });
    },

    updateAudioFromOriginal: function (req, res) {
      const { articleId } = req.params;
      let { slidePosition, subslidePosition } = req.body;
      slidePosition = parseInt(slidePosition);
      subslidePosition = parseInt(subslidePosition);
      let article;

      let audioPath;
      let audioUrl;
      let audioDuration;
      let newAudioUrl;
      let fileName;
      articleService
        .findById(articleId)
        .then((articleDoc) => {
          if (!articleDoc) throw new Error("Invalid article id");
          article = articleDoc.toObject();
          if (article.articleType !== "translation")
            throw new Error("This is only available for translation articles");
          return articleService.findById(article.originalArticle);
        })
        .then((originalArticle) => {
          article.originalArticle = originalArticle.toObject();
          const slide = article.originalArticle.slides.find(
            (s) => s.position === slidePosition
          );
          if (!slide) throw new Error("Invalid slidePosition");
          const subslide = slide.content.find(
            (s) => s.position === subslidePosition
          );
          if (!subslide) throw new Error("Invalid subslide position");
          // Create a new clone for the audio file and upload it
          audioUrl = subslide.audio;

          return fileUtils.downloadFile(audioUrl);
        })
        .then((filePath) => {
          audioPath = filePath;
          return fileUtils.getAudioDuration(audioPath);
        })
        .then((duration) => {
          audioDuration = duration / 1000;
          fileName = `cloned_audio_${uuid()}.${audioUrl.split(".").pop()}`;
          return storageService.saveFile(
            TRANSLATION_AUDIO_DIRECTORY,
            fileName,
            fs.createReadStream(audioPath)
          );
        })
        .then((uploadRes) => {
          const { data, url } = uploadRes;
          newAudioUrl = url;
          fs.unlink(audioPath, () => {});
          return articleService.updateSubslideUsingPosition(
            articleId,
            slidePosition,
            subslidePosition,
            {
              audio: url,
              audioKey: data.Key,
              audioFileName: fileName,
              audioUser: req.user._id,
              audioProcessed: false,
              audioSynced: true,
              audioSource: "original",
              audioDuration,
            }
          );
        })
        .then(() => {
          return res.json({
            slidePosition,
            subslidePosition,
            audio: newAudioUrl,
            audioSynced: true,
            audioProcessed: false,
            audioDuration,
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    addRecordedAudio: function (req, res) {
      const { file } = req;
      const { articleId } = req.params;
      let { slidePosition, subslidePosition } = req.body;
      slidePosition = parseInt(slidePosition);
      subslidePosition = parseInt(subslidePosition);
      if (!file) return res.status(400).send("Invalid file field");
      let uploadedAudioUrl;
      let article;

      const filePath = file.path;
      const fileExtension = file.mimetype.split("/").pop();
      const fileName = `audio-${uuid()}.${fileExtension}`;
      let user;
      let audioDuration;
      userService
        .getUserByEmail(req.user.email)
        .then((u) => {
          user = u;
          return articleService.findById(articleId);
        })
        .then((articleDoc) => {
          if (!articleDoc) throw new Error("Invalid article id");
          article = articleDoc;
          return fileUtils.getAudioDuration(filePath);
        })
        .then((duration) => {
          audioDuration = duration / 1000;
          const slide = article.slides.find(
            (s) => s.position === slidePosition
          );
          const subslide = slide.content.find(
            (s) => s.position === subslidePosition
          );
          console.log("starting upload");
          console.log("duration is", duration);
          console.log('subslide duration', subslide.media[0].duration * 1000 + 1000)
          // Keep a margin of 1 second available for recordings
          if (((subslide.media[0].duration * 1000) + 1000) < duration) {
            throw new Error(
              "Audio duration should be less than or equal the video slide duration"
            );
          }
          return storageService.saveFile(
            TRANSLATION_AUDIO_DIRECTORY,
            fileName,
            fs.createReadStream(filePath)
          );
        })
        .then((uploadRes) => {
          console.log("uploaded", uploadRes);
          uploadedAudioUrl = uploadRes.url;
          // Delete previous audio if exists
          const slide = article.slides.find(
            (s) => s.position === slidePosition
          );
          const subslide = slide.content.find(
            (s) => s.position === subslidePosition
          );
          if (subslide.audio && subslide.audioFileName) {
            storageService
              .deleteFile(TRANSLATION_AUDIO_DIRECTORY, subslide.audioFileName)
              .then(() => {
                console.log("deleted file");
              })
              .catch((err) => {
                console.log("error deleting file", err);
              });
          }

          const articleUpdate = {
            audio: uploadRes.url,
            rawAudio: uploadRes.url,
            audioKey: uploadRes.data.Key,
            audioFileName: fileName,
            audioUser: user._id,
            audioProcessed: false,
            audioSynced: true,
            audioSource: "user",
            audioDuration,
          };
          return articleService.updateSubslideUsingPosition(
            articleId,
            slidePosition,
            subslidePosition,
            articleUpdate
          );
        })
        .then(() => {
          websocketsService.emitEvent({
            room: websocketsRooms.getOrganizationRoom(article.organization),
            event: `${websocketsEvents.TRANSLATION_SUBSLIDE_CHANGE}/${articleId}`,
            data: {
              slidePosition,
              subslidePosition,
              changes: { audio: uploadedAudioUrl },
            },
          });
          return res.json({
            audio: uploadedAudioUrl,
            slidePosition,
            subslidePosition,
            audioSynced: true,
            audioDuration,
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message || "Something went wrong");
        })
        .then(() => {
          articleService
            .update({ _id: articleId }, { exported: false })
            .then(() => {})
            .catch((err) => {
              console.log("error updating article exported", err);
            });
        });
    },

    deleteRecordedAudio: function (req, res) {
      const { articleId } = req.params;
      const { slidePosition, subslidePosition } = req.body;
      let article;
      articleService
        .findById(articleId)
        .then((a) => {
          if (!a) throw new Error("Invalid article id");
          article = a.toObject();
          return articleService.updateSubslideUsingPosition(
            articleId,
            slidePosition,
            subslidePosition,
            {
              audio: "",
              audioKey: "",
              audioFileName: "",
              audioSynced: false,
              audioSource: "",
              audioDuration: 0,
            }
          );
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message || "Something went wrong");
        })
        .then(() => {
          res.json({
            audio: "",
            slidePosition,
            subslidePosition,
            audioSynced: false,
            audioDuration: 0,
          });
          websocketsService.emitEvent({
            room: websocketsRooms.getOrganizationRoom(article.organization),
            event: `${websocketsEvents.TRANSLATION_SUBSLIDE_CHANGE}/${articleId}`,
            data: { slidePosition, subslidePosition, changes: { audio: "" } },
          });
          const slide = article.slides.find(
            (s) => s.position === slidePosition
          );
          const subslide = slide.content.find(
            (s) => s.position === subslidePosition
          );
          const { audioFileName } = subslide;
          if (audioFileName) {
            return storageService.deleteFile(
              TRANSLATION_AUDIO_DIRECTORY,
              audioFileName
            );
          }
          return Promise.resolve();
        })

        .then((deleteRes) => {
          console.log("deleted", deleteRes);
        })
        .catch((err) => {
          console.log(err);
        });
    },

    generateTTSAudio: function (req, res) {
      const { articleId } = req.params;
      const { slidePosition, subslidePosition } = req.body;

      let article;
      articleService
        .findById(articleId)
        .then((articleDoc) => {
          if (!articleDoc) throw new Error("Invalid article id");
          article = articleDoc.toObject();
          if (!article.tts)
            throw new Error("This feature is available only to tts articles");
          return utils.generateSlideTextToSpeech(
            articleId,
            slidePosition,
            subslidePosition,
            req.user._id
          );
        })
        .then((data) => {
          res.json({
            audio: data.audio,
            audioDuration: data.audioDuration,
            slidePosition,
            subslidePosition,
            audioSynced: true,
          });
          websocketsService.emitEvent({
            room: websocketsRooms.getOrganizationRoom(article.organization),
            event: `${websocketsEvents.TRANSLATION_SUBSLIDE_CHANGE}/${articleId}`,
            data: {
              slidePosition,
              subslidePosition,
              changes: { audio: data.audio },
            },
          });

          articleService
            .update({ _id: articleId }, { exported: false })
            .then(() => {})
            .catch((err) => {
              console.log("error updating article exported", err);
            });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    updateAudioSpeed: function (req, res) {
      const { articleId } = req.params;
      const { audioSpeed, slidePosition, subslidePosition, type } = req.body;
      articleService
        .findById(articleId)
        .then((article) => {
          return new Promise((resolve, reject) => {
            const updateSpeedFuncArray = [];
            if (!article) {
              throw new Error("Invalid article id");
            }
            let speedFunc;
            if (article.tts) {
              speedFunc = (
                articleId,
                slidePosition,
                subslidePosition,
                audioSpeed,
                userId
              ) =>
                new Promise((resolve, reject) => {
                  utils
                    .updateTTSSlideAudioSpeed(
                      articleId,
                      slidePosition,
                      subslidePosition,
                      audioSpeed,
                      userId
                    )
                    .then(resolve)
                    .catch(reject);
                });
            } else {
              speedFunc = (
                articleId,
                slidePosition,
                subslidePosition,
                audioSpeed,
                userId
              ) =>
                new Promise((resolve, reject) => {
                  utils
                    .updateSlideAudioSpeed(
                      articleId,
                      slidePosition,
                      subslidePosition,
                      audioSpeed,
                      userId
                    )
                    .then(resolve)
                    .catch(reject);
                });
            }
            if (type === "all") {
              const subslides = article.slides
                .reduce(
                  (acc, s) =>
                    acc.concat(
                      s.content.map((ss) => ({
                        ...ss,
                        slidePosition: s.position,
                        subslidePosition: ss.position,
                      }))
                    ),
                  []
                )
                .filter(
                  (s) =>
                    s.speakerProfile && s.speakerProfile.speakerNumber !== -1
                );
              subslides.forEach(({ slidePosition, subslidePosition }) => {
                updateSpeedFuncArray.push((cb) => {
                  speedFunc(
                    articleId,
                    slidePosition,
                    subslidePosition,
                    audioSpeed,
                    req.user._id
                  )
                    .then((data) =>
                      cb(null, {
                        slidePosition,
                        subslidePosition,
                        audio: data.audioUrl,
                        audioDuration: data.audioDuration,
                        audioSpeed,
                      })
                    )
                    .catch(cb);
                });
              });
            } else {
              updateSpeedFuncArray.push((cb) => {
                speedFunc(
                  articleId,
                  slidePosition,
                  subslidePosition,
                  audioSpeed,
                  req.user._id
                )
                  .then((data) =>
                    cb(null, {
                      slidePosition,
                      subslidePosition,
                      audio: data.audio,
                      audioDuration: data.audioDuration,
                      audioSpeed,
                    })
                  )
                  .catch(cb);
              });
            }
            async.parallelLimit(updateSpeedFuncArray, 2, (err, result) => {
              if (err) return reject(err);
              return resolve(result);
            });
          });
        })
        .then((result) => {
          return res.json(result);
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    updateVideoSpeed: function (req, res) {
      const { articleId } = req.params;
      const { videoSpeed, slidePosition, subslidePosition, type } = req.body;
      let article;
      let originalArticle;
      let video;
      articleService
        .findById(articleId)
        .then((articleDoc) => {
          if (!articleDoc) throw new Error("Invalid article id");
          let article = articleDoc.toObject();
          if (article.videoSpeedLoading) throw new Error("Already processing");
          if (videoSpeed < 0.5) {
            throw new Error('Video Speed cannot be less than 50%')
          }

          return articleService.updateById(articleId, {
            videoSpeedLoading: true,
          });
        })
        .then(() => articleService.findById(articleId))
        .then((a) => {
          article = a;
          return articleService.findById(article.originalArticle)
        })
        .then(o => {
          originalArticle = o;
          return videoService.findById(article.video)
        })
        .then((v) => {
          video = v;
          if (type === "all") {
            exporterWorker.updateArticleVideoSpeed({
               id: articleId,
               videoUrl: video.compressedVideoUrl || video.url,
               originalSlides: originalArticle.slides,
               videoSpeed,
            });
          } else {
            exporterWorker.updateArticleSlideVideoSpeed({
               id: articleId,
               videoUrl: video.compressedVideoUrl || video.url,
               slides: article.slides,
               originalSlides: originalArticle.slides,
               videoSpeed,
               slidePosition: parseInt(slidePosition),
               subslidePosition: parseInt(subslidePosition), 
            });
          }
          return res.json({ success: true, videoSpeedLoading: true });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },
  };
};
module.exports = controller;

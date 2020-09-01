const async = require("async");
const fs = require("fs");
const uuid = require("uuid").v4;
const TranslationExport = require("../shared/models").TranslationExport;
const BulkTranslationExport = require("../shared/models").BulkTranslationExport;

const {
  articleService,
  notificationService,
  videoService,
  userService,
  emailService,
} = require("../shared/services");
const { Subtitles } = require("../shared/models");

const controller = ({ workers }) => {
  const { exporterWorker } = workers;

  const utils = require("./utils")({ workers });
  return {
    getByArticleId: function (req, res) {
      const { articleId } = req.params;
      let { page } = req.query;
      console.log("page is ", page);
      const perPage = 5;
      if (page) {
        page = parseInt(page);
      } else {
        page = 1;
      }
      const skip = page === 1 ? 0 : page * perPage - perPage;
      let translationExports;
      TranslationExport.find({ article: articleId })
        .skip(skip)
        .limit(perPage)
        .sort({ created_at: -1 })
        .then((te) => {
          translationExports = te;
          return TranslationExport.count({ article: articleId });
        })
        .then((count) => {
          const fetchUsersInfoFuncArray = [];

          translationExports.forEach((translationExport) => {
            fetchUsersInfoFuncArray.push((cb) => {
              utils
                .getTranslationExportWithUsersFields(translationExport._id)
                .then((transExport) => {
                  return cb(null, transExport);
                })
                .catch((err) => {
                  console.log(err);
                  cb();
                });
            });
          });

          async.parallelLimit(
            fetchUsersInfoFuncArray,
            10,
            (err, translationExports) => {
              return res.json({
                translationExports,
                pagesCount: Math.ceil(count / perPage),
              });
            }
          );
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    exportTranslationRequest: function (req, res) {
      const { articleId } = req.body;
      let article;
      let newTranslationExport;
      const user = req.user;
      articleService
        .findById(articleId)
        .then((a) => {
          if (!a) throw new Error("Invalid article id");
          article = a;

          const { valid, message } = utils.validateArticleExport(article);
          if (!valid) {
            throw new Error(message);
          }

          return TranslationExport.find({
            article: article._id,
            exportRequestStatus: "pending",
          });
        })
        .then((pendingRequests) => {
          if (pendingRequests && pendingRequests.length > 0)
            throw new Error("An export request is already pending approval");

          const subslides = articleService
            .cleanArticleSilentAndBackgroundMusicSlides(article)
            .slides.reduce((acc, s) => acc.concat(s.content), []);
          const translationByIds = [];
          subslides.forEach((subslide) => {
            if (
              subslide.audioUser &&
              translationByIds.indexOf(subslide.audioUser.toString()) === -1
            ) {
              translationByIds.push(subslide.audioUser.toString());
            }
          });
          const translationExportItem = {
            organization: article.organization,
            video: article.video,
            article: article._id,
            exportRequestStatus: "pending",
            exportRequestBy: user._id,
            translationBy: translationByIds,
          };

          return TranslationExport.create(translationExportItem);
        })
        .then((translationExport) => {
          return new Promise((resolve) => {
            res.json({ translationExport });
            newTranslationExport = translationExport;
            if (!article.translators || article.translators.length === 0)
              return resolve();
            // TODO: notify admins and verifiers with export request
            let articleAdminsIds = article.translators.map((t) => t.invitedBy);
            if (article.verifiers && article.verifiers.length > 0) {
              articleAdminsIds = articleAdminsIds.concat(article.verifiers);
            }
            // Filter duplicates
            articleAdminsIds = articleAdminsIds.filter(
              (v, i) => articleAdminsIds.indexOf(v) === i
            );
            if (articleAdminsIds.length === 0) return resolve();
            articleAdminsIds
              .map((adminId) => adminId.toString())
              .filter((adminId) => adminId !== user._id.toString())
              .forEach((adminId) => {
                const notificationData = {
                  owner: adminId,
                  from: user._id,
                  organization: article.organization,
                  type: "translation_export_request",
                  content: `${
                    user.email
                  } has requested an export review on the video translation "${
                    article.title
                  }" (${article.langCode || article.langName})`,
                  resource: article._id,
                  resourceType: "article",
                };
                notificationService
                  .notifyUser(
                    {
                      _id: adminId,
                      organization: article.organization.toString(),
                    },
                    notificationData
                  )
                  .then((data) => {
                    console.log("notified admin", data);
                    return userService.findById(adminId);
                  })
                  .then((userData) => {
                    emailService.inviteUserToVerifyTranslation({
                      from: req.user,
                      to: userData,
                      articleId,
                    });
                  })
                  .catch((err) => {
                    console.log("error notifying admin", err);
                  });
              });
            resolve();
          });
        })
        // Set the version number
        .then(() => {
          return new Promise((resolve) => {
            // Skip 1 to skip the newely created export
            console.log("translatin export versioning");
            TranslationExport.find({ article: article._id })
              .sort({ created_at: -1 })
              .skip(1)
              .limit(1)
              .then((latestExports) => {
                let latestExport;
                if (latestExports.length > 0) {
                  latestExport = latestExports[0];
                }
                let version = 1;
                let subVersion = 0;
                if (latestExport) {
                  // If it was exported, then it's a subversion update
                  // Else it's a version update
                  if (article.exported) {
                    version = latestExport.version || 1;
                    subVersion = (latestExport.subVersion || 0) + 1;
                  } else {
                    version = (latestExport.version || 0) + 1;
                    subVersion = 0;
                  }
                }
                console.log("versions", version, subVersion);
                return TranslationExport.update(
                  { _id: newTranslationExport._id },
                  { $set: { version, subVersion } }
                );
              })
              .then(() =>
                articleService.update({ _id: article._id }, { exported: true })
              )
              .then(() => {
                resolve();
              })
              .catch((err) => {
                resolve();
                console.log("error setting version", err);
              });
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    approveTranslationExport: function (req, res) {
      const { translationExportId } = req.params;
      let translationExport;
      let article;
      TranslationExport.findById(translationExportId)
        .then((te) => {
          if (!te) throw new Error("Invalid translation export id");
          translationExport = te;
          return articleService.findById(translationExport.article);
        })
        .then((articleDoc) => {
          if (!articleDoc) throw new Error("Invalid article id");
          article = articleDoc.toObject();
          return videoService.findById(article.video);
        })
        .then((videoDoc) => {
          article.video = videoDoc.toObject();
          const { valid, message } = utils.validateArticleExport(article);
          if (!valid) {
            throw new Error(message);
          }
          return TranslationExport.find({
            article: article._id,
            status: { $in: ["queued", "processing"] },
          });
        })
        .then((progressingTranslationExports) => {
          return new Promise((resolve, reject) => {
            if (
              progressingTranslationExports &&
              progressingTranslationExports.length === 1 &&
              progressingTranslationExports[0]._id.toString() ===
                translationExportId
            ) {
              return resolve();
            }

            if (
              progressingTranslationExports &&
              progressingTranslationExports.length > 0
            ) {
              return reject(new Error("This video is already being exported"));
            }
            return resolve();
          });
        })
        .then(() => {
          const subslides = articleService
            .cleanArticleSilentAndBackgroundMusicSlides(article)
            .slides.reduce((acc, s) => acc.concat(s.content), []);
          const translationByIds = [];
          subslides.forEach((subslide) => {
            if (
              subslide.audioUser &&
              translationByIds.indexOf(subslide.audioUser.toString()) === -1
            ) {
              translationByIds.push(subslide.audioUser.toString());
            }
          });
          const translationExportUpdate = {
            status: "queued",
            exportRequestStatus: "approved",
            approvedBy: req.user._id,
            translationBy: translationByIds,
            dir: uuid(),
            hasBackgroundMusic: Boolean(article.video.backgroundMusicUrl),
            backgroundMusicTransposed: article.video.backgroundMusicTransposed,
          };

          return TranslationExport.update(
            { _id: translationExport._id },
            { $set: translationExportUpdate }
          );
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        })
        .then(() => {
          res.json({
            success: true,
            message: "The video has been queued to be exported",
          });
          // Process audios
          return utils.processArticleAudios(article, translationExport);
        })
        .then(() => TranslationExport.findById(translationExport._id).populate('article').populate('video'))
        .then(te => {
          translationExport = te;
          return articleService.findById(te.article.originalArticle)
        })
        .then((originalArticle) => {
          const article = translationExport.article;
          const video = translationExport.video;
          exporterWorker.exportArticleTranslation({
            id: translationExport._id,
            cancelNoise: translationExport.cancelNoise,
            voiceVolume: translationExport.voiceVolume,
            normalizeAudio: translationExport.normalizeAudio,
            backgroundMusicVolume: translationExport.backgroundMusicVolume,
            dir: translationExport.dir,
            slides: translationExport.article.slides,
            originalSlides: originalArticle.slides,
            signLang: article.signLang,
            langCode: article.langCode,
            langName: article.langName,
            title: article.title,
            videoUrl: video.url,  
            backgroundMusicUrl: video.backgroundMusicUrl,
          });
        })
        .catch((err) => {
          console.log(err);
          TranslationExport.update(
            { _id: translationExport._id },
            { $set: { status: "failed" } }
          )
            .then(() => {})
            .catch((err) => console.log(err));
        });
    },

    declineTranslationExport: function (req, res) {
      const { translationExportId } = req.params;
      TranslationExport.update(
        { _id: translationExportId },
        { $set: { exportRequestStatus: "declined", declinedBy: req.user._id } }
      )
        .then(() => {
          return res.json({ success: true });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    archiveAudios: function (req, res) {
      const { translationExportId } = req.params;
      TranslationExport.update(
        { _id: translationExportId },
        { $set: { audiosArchiveProgress: 10, audioArchiveBy: req.user._id } }
      )
        .then(() => {
          return TranslationExport.findById(translationExportId).populate('article')
        })
        .then((translationExport) => {
          const article = translationExport.article;
          exporterWorker.archiveArticleTranslationAudios({ id: translationExportId, slides: article.slides, langCode: article.langCode, title: article.title });
          return utils.getTranslationExportWithUsersFields(translationExportId);
        })
        .then((translationExport) => {
          return res.json({ translationExport, queued: true });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    generateVideoSubtitle: function (req, res) {
      const { translationExportId } = req.params;
      let article;
      let translationExport;
      TranslationExport.update(
        { _id: translationExportId },
        { $set: { subtitleProgress: 30, subtitleBy: req.user._id } }
      )
        .then(() => TranslationExport.findById(translationExportId).populate('article'))
        .then(te => {
          translationExport = te;
          article = te.article;
          return Subtitles.find({ article: translationExport.article._id }).sort({ created_at: -1 })
        })
        .then((subtitles) => {
          const subtitle = subtitles[0];
          exporterWorker.generateTranslatedArticleSubtitles({
            id: translationExportId,
            title: article.title,
            langCode: article.langCode,
            langName: article.langName,
            dir: translationExport.dir,
            subtitles: subtitle.subtitles,
          });
          return utils.getTranslationExportWithUsersFields(translationExportId);
        })
        .then((translationExport) => {
          return res.json({ queued: true, translationExport });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    burnVideoSubtitle: function (req, res) {
      const { translationExportId } = req.params;
      let translationExport
      let article;
      TranslationExport.update(
        { _id: translationExportId },
        { $set: { subtitledVideoProgress: 30, subtitledVideoBy: req.user._id } }
      )
      .then(() => TranslationExport.findById(translationExportId).populate('article'))
      .then((t) => {
        translationExport = t;
        article = translationExport.article;
        return Subtitles.find({ article: translationExport.article._id }).sort({ created_at: -1 })
      })
        .then((subtitles) => {
          const subtitle = subtitles[0];
          exporterWorker.burnTranslatedArticleVideoSubtitle({
            id: translationExportId,
            videoUrl: translationExport.videoUrl,
            title: article.title,
            langCode: article.langCode,
            langName: article.langName,
            dir: translationExport.dir,
            subtitles: subtitle.subtitles,
            });
          return utils.getTranslationExportWithUsersFields(translationExportId);
        })
        .then((translationExport) => {
          return res.json({ queued: true, translationExport });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    burnVideoSubtitleAndSignlanguage: function (req, res) {
      const { translationExportId } = req.params;
      const { articleId } = req.body;
      let translationExport;
      TranslationExport.update(
        { _id: translationExportId },
        {
          $set: {
            subtitledSignlanguageVideoProgress: 10,
            signLanguageArticle: articleId,
            subtitledSignlanguageVideoBy: req.user._id,
          },
        }
      )
      .then(() => TranslationExport.findById(translationExportId).populate('article').populate('signLanguageArticle').populate('video'))
      .then((t) => {
        translationExport = t;
        return Subtitles.find({ article: translationExport.article._id }).sort({ created_at: -1 })
      })
        .then((subtitles) => {
          const subtitle = subtitles[0];
          exporterWorker.burnTranslatedArticleVideoSubtitleAndSignlanguage(
            {

              id: translationExportId,
              videoUrl: translationExport.video.url,
              dir: translationExport.dir,
              langCode: translationExport.article.langCode,
              langName: translationExport.article.langName,
              title: translationExport.article.title,
              subtitles: subtitle.subtitles,
              slides: translationExport.signLanguageArticle.slides,
            }
          );
          return utils.getTranslationExportWithUsersFields(translationExportId);
        })
        .then((translationExport) => {
          return res.json({ queued: true, translationExport });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    updateVoiceVolume: function (req, res) {
      const { translationExportId } = req.params;
      const { voiceVolume } = req.body;
      TranslationExport.update(
        { _id: translationExportId },
        { $set: { voiceVolume } }
      )
        .then(() => {
          return res.json({ voiceVolume });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    updateAudioSettings: function (req, res) {
      const { translationExportId } = req.params;
      const {
        voiceVolume,
        backgroundMusicVolume,
        normalizeAudio,
        cancelNoise,
      } = req.body;
      const changes = {};
      if (typeof voiceVolume !== "undefined") {
        changes.voiceVolume = parseFloat(voiceVolume).toFixed(2);
      }
      if (typeof backgroundMusicVolume !== "undefined") {
        changes.backgroundMusicVolume = parseFloat(
          backgroundMusicVolume
        ).toFixed(2);
      }
      if (typeof normalizeAudio !== "undefined") {
        changes.normalizeAudio = normalizeAudio;
      }
      if (typeof cancelNoise !== "undefined") {
        changes.cancelNoise = cancelNoise;
      }
      TranslationExport.update({ _id: translationExportId }, { $set: changes })
        .then(() => {
          return res.json(changes);
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    exportMultipleTranslationRequest: function (req, res) {
      const {
        articlesIds,
        voiceVolume,
        normalizeAudio,
        downloadZip,
      } = req.body;
      let articlesFuncArray = [];

      articlesIds.forEach((articleId) => {
        articlesFuncArray.push((cb1) => {
          utils
            .createTranslationExport(
              req.user._id,
              articleId,
              voiceVolume,
              normalizeAudio
            )
            .then((data) => {
              cb1(null, data);
            })
            .catch((err) => {
              cb1();
              console.log(err);
            });
        });
      });

      async
        .series(articlesFuncArray)
        .then((createdTranslationsExports) => {
          res.json({
            success: true,
            message: "The videos have been queued to be exported",
          });
          createdTranslationsExports = createdTranslationsExports.filter(
            (t) => t
          );
          let exportsFuncArray = [];
          createdTranslationsExports.forEach(
            ({ createdTranslationExport, article }) => {
              exportsFuncArray.push((cb2) => {
                utils
                  .processArticleAudios(article, createdTranslationExport)
                  .then(() => {
                    cb2(null, createdTranslationExport);
                  })
                  .catch((err) => {
                    cb2();
                    console.log(err);
                  });
              });
            }
          );

          async
            .series(exportsFuncArray)
            .then((createdTranslationsExports) => {
              const ids = createdTranslationsExports.map((cte) => cte._id);

            // id: translationExport._id,
            // cancelNoise: translationExport.cancelNoise,
            // voiceVolume: translationExport.voiceVolume,
            // normalizeAudio: translationExport.normalizeAudio,
            // backgroundMusicVolume: translationExport.backgroundMusicVolume,
            // dir: translationExport.dir,
            // slides: translationExport.article.slides,
            // originalSlides: originalArticle.slides,
            // signLang: article.signLang,
            // langCode: article.langCode,
            // langName: article.langName,
            // title: article.title,
            // videoUrl: video.url,  
            // backgroundMusicUrl: video.backgroundMusicUrl,
              if (downloadZip) {
                BulkTranslationExport.create({
                  translationExportIds: ids,
                  finishedTranslationExportIds: [],
                  exportBy: req.user._id,
                  organization: createdTranslationsExports[0].organization,
                })
                  .then(() => {
                    console.log("created bulk export");
                  })
                  .catch((err) => {
                    console.log("error creating bulk export", err);
                  });

                ids.forEach((id) => {
                  let article;
                  let video;
                  let originalArticle;
                  let translationExport;
                  TranslationExport.findById(id).populate('article').populate('video')
                  .then(te => {
                    translationExport = te;
                    article = te.article;
                    video = te.video;
                  
                    return articleService.findById(article.originalArticle);
                  })
                  .then(oa => {
                    originalArticle = oa;
                    exporterWorker.exportArticleTranslation({ 
                      id: translationExport._id,
                      cancelNoise: translationExport.cancelNoise,
                      voiceVolume: translationExport.voiceVolume,
                      normalizeAudio: translationExport.normalizeAudio,
                      backgroundMusicVolume: translationExport.backgroundMusicVolume,
                      dir: translationExport.dir,
                      slides: translationExport.article.slides,
                      originalSlides: originalArticle.slides,
                      signLang: article.signLang,
                      langCode: article.langCode,
                      langName: article.langName,
                      title: article.title,
                      videoUrl: video.url,  
                      backgroundMusicUrl: video.backgroundMusicUrl,
                     });
                  })
                  .catch(err => {
                    console.log(err)
                  })
                });
              } else {
                ids.forEach((id) => {
                  let article;
                  let video;
                  let originalArticle;
                  let translationExport;
                  TranslationExport.findById(id).populate('article').populate('video')
                  .then(te => {
                    translationExport = te;
                    article = te.article;
                    video = te.video;
                  
                    return articleService.findById(article.originalArticle);
                  })
                  .then(oa => {
                    originalArticle = oa;
                    exporterWorker.exportArticleTranslation({ 
                      id: translationExport._id,
                      cancelNoise: translationExport.cancelNoise,
                      voiceVolume: translationExport.voiceVolume,
                      normalizeAudio: translationExport.normalizeAudio,
                      backgroundMusicVolume: translationExport.backgroundMusicVolume,
                      dir: translationExport.dir,
                      slides: translationExport.article.slides,
                      originalSlides: originalArticle.slides,
                      signLang: article.signLang,
                      langCode: article.langCode,
                      langName: article.langName,
                      title: article.title,
                      videoUrl: video.url,  
                      backgroundMusicUrl: video.backgroundMusicUrl,
                     });
                  })
                  .catch(err => {
                    console.log(err)
                  })
                });
              }

              console.log("done exporting selected translations");
            })
            .catch((err) => {
              console.log("exporting selected videos", err);
            });
        })
        .catch((err) => {
          console.log(err);
        });
    },
  };
};

module.exports = controller;

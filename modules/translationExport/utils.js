const async = require("async");
const TranslationExport = require("../shared/models").TranslationExport;
const fs = require("fs");
const request = require("request");
const archiver = require("archiver");
const uuid = require("uuid").v4;

const {
  storageService,
  articleService,
  videoService,
  userService,
} = require("../shared/services");

const { TRANSLATION_AUDIO_DIRECTORY } = require("./constants");

module.exports = ({ workers }) => {
  const { audioProcessorWorker } = workers;
  
  function validateArticleExport(article) {
    if (article.articleType !== "translation")
      return {
        valid: false,
        message: "Only Translation articles can be exported",
      };
    const { slides } = article;
    const allSubslides = slides
      .filter((s) => s.content && s.content.length > 0)
      .reduce((acc, s) => acc.concat(s.content), [])
      .filter((s) => !s.silent && s.speakerProfile.speakerNumber !== -1);
    if (allSubslides.every((subslide) => subslide.text && subslide.audio))
      return { valid: true };
    if (
      article.signLang &&
      allSubslides.every((subslide) => subslide.picInPicVideoUrl)
    )
      return { valid: true };
    return { valid: false, message: "All slides should have audio and text" };
  }

  function getTranslationExportWithUsersFields(translationExportId) {
    return new Promise((resolve, reject) => {
      TranslationExport.findById(translationExportId)
        .then((translationExport) => {
          translationExport = translationExport.toObject();
          const fetchUsers = [
            { field: "exportRequestBy", id: translationExport.exportRequestBy },
            { field: "approvedBy", id: translationExport.approvedBy },
            { field: "declinedBy", id: translationExport.declinedBy },
            { field: "translationBy", ids: translationExport.translationBy },
          ];
          const fetchUsersFuncArray = [];
          translationExport.translationBy = [];
          fetchUsers.forEach((p) => {
            if (p.id) {
              fetchUsersFuncArray.push((cb) => {
                userService
                  .findById(p.id)
                  .then((userData) => {
                    translationExport[p.field] = {
                      firstname: userData.firstname,
                      lastname: userData.lastname,
                      email: userData.email,
                    };
                    cb();
                  })
                  .catch((err) => {
                    console.log(err);
                    cb();
                  });
              });
            } else if (p.ids) {
              p.ids.forEach((id) => {
                fetchUsersFuncArray.push((cb) => {
                  userService
                    .findById(id)
                    .then((userData) => {
                      translationExport[p.field].push({
                        firstname: userData.firstname,
                        lastname: userData.lastname,
                        email: userData.email,
                      });
                      cb();
                    })
                    .catch((err) => {
                      console.log(err);
                      cb();
                    });
                });
              });
            }
          });
          async.parallelLimit(fetchUsersFuncArray, 2, () => {
            return resolve(translationExport);
          });
        })
        .catch(reject);
    });
  }

  function createTranslationExport(
    requestedBy,
    articleId,
    voiceVolume,
    normalizeAudio
  ) {
    return new Promise((resolve, reject) => {
      let article;
      let createdTranslationExport;
      articleService
        .findById(articleId)
        .then((a) => {
          if (!a) throw new Error("Invalid article id");
          article = a;

          const { valid, message } = validateArticleExport(article);
          if (!valid) {
            throw new Error(message);
          }

          return videoService.findById(article.video);
        })
        .then((v) => {
          article.video = v;

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
            exportRequestBy: requestedBy,
            translationBy: translationByIds,
            status: "queued",
            exportRequestStatus: "approved",
            approvedBy: requestedBy,
            dir: uuid(),
            hasBackgroundMusic: Boolean(article.video.backgroundMusicUrl),
            backgroundMusicTransposed: article.video.backgroundMusicTransposed,
          };
          if (typeof voiceVolume !== "undefined") {
            translationExportItem.voiceVolume = parseFloat(voiceVolume).toFixed(
              2
            );
          }
          if (typeof normalizeAudio !== "undefined") {
            translationExportItem.normalizeAudio = normalizeAudio;
          }
          return TranslationExport.create(translationExportItem);
        })
        .then((cte) => {
          console.log(
            "============================================= directly ctrated translation export =============================================",
            cte
          );

          createdTranslationExport = cte;
          console.log("translatin export versioning");
          return TranslationExport.find({ article: article._id })
            .sort({ created_at: -1 })
            .skip(1)
            .limit(1);
        })
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
            { _id: createdTranslationExport._id },
            { $set: { version, subVersion } }
          );
        })
        .then(() =>
          articleService.update({ _id: article._id }, { exported: true })
        )
        .then(() => {
          resolve({ createdTranslationExport, article });
        })
        .catch(reject);
    });
  }

  function processArticleAudios(article, translationExport) {
    return new Promise((resolve, reject) => {
      const processAudioFuncArray = [];
      const cleanedArticle = articleService.cleanArticleSilentAndBackgroundMusicSlides(
        article
      );
      cleanedArticle.slides.forEach((slide) => {
        slide.content.forEach((subslide) => {
          if (
            !subslide.silent &&
            subslide.speakerProfile &&
            subslide.speakerProfile.speakerNumber !== -1 &&
            !subslide.audioProcessed &&
            subslide.audio
          ) {
            processAudioFuncArray.push((cb) => {
              const audioFileName = `cleared_audio_${uuid()}.mp3`;
              audioProcessorWorker
                .processRecordedAudioViaApi({
                  url: subslide.audio,
                  outputFormat: "mp3",
                })
                .then((fileBuffer) => {
                  return new Promise((resolve, reject) => {
                    fs.writeFile(audioFileName, fileBuffer, (err) => {
                      if (err) {
                        console.log(err);
                        return reject(err);
                      }
                      storageService
                        .saveFile(
                          TRANSLATION_AUDIO_DIRECTORY,
                          audioFileName,
                          fs.createReadStream(audioFileName)
                        )
                        .then(resolve)
                        .catch(reject);
                    });
                  });
                })
                .then((uploadRes) => {
                  fs.unlink(audioFileName, (err) => {
                    if (err) {
                      console.log("error removing file", err);
                    }
                  });
                  return articleService.updateSubslideUsingPosition(
                    article._id,
                    slide.position,
                    subslide.position,
                    {
                      audioProcessed: true,
                      processedAudio: uploadRes.url,
                      processedAudioKey: uploadRes.Key,
                      processedAudioFileName: audioFileName,
                    }
                  );
                })
                .then((r) => {
                  return cb(null, r);
                })
                .catch((err) => {
                  console.log(err);
                  TranslationExport.update(
                    { _id: translationExport._id },
                    { $set: { status: "failed" } }
                  )
                    .then(() => {})
                    .catch((err) => console.log(err));
                  return cb(null, null);
                });
            });
          }
        });
      });
      async.parallelLimit(processAudioFuncArray, 2, (err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  return {
    validateArticleExport,
    getTranslationExportWithUsersFields,
    createTranslationExport,
    processArticleAudios,
  };
};

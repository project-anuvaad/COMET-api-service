const path = require("path");
const fs = require("fs");
const uuid = require("uuid").v4;
const async = require("async");
const { TRANSLATION_AUDIO_DIRECTORY } = require("./constants");
const fileUtils = require("./fileUtils");

const {
  storageService,
  articleService,
  userService,
  organizationService,
  authService,
  emailService,
  textToSpeechService
} = require("../shared/services");


class TranslationService {
  constructor({ workers }) {
    this.audioProcessorWorker = workers.audioProcessorWorker;
  }
  validateArticleExport(article) {
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
    if (article.signLang && allSubslides.every((sub) => sub.picInPicVideoUrl))
      return { valid: true };
    if (article.signLang) {
      return { valid: false, message: "All slides should have videos" };
    }
    return { valid: false, message: "All slides should have audio and text" };
  }

  generateSlideTextToSpeech(
    articleId,
    slidePosition,
    subslidePosition,
    userId
  ) {
    return new Promise((resolve, reject) => {
      const audioPath = path.join(__dirname, `tts_audio${uuid()}.mp3`);
      let uploadedAudioUrl = "";
      let article;
      let subslide;
      let audioDuration;

      // fetch article
      articleService
        .findById(articleId)
        .then((a) => {
          article = a;
          subslide = article.slides
            .find((s) => parseInt(s.position) === parseInt(slidePosition))
            .content.find(
              (s) => parseInt(s.position) === parseInt(subslidePosition)
            );

          if (!subslide || !subslide.text) {
            return reject("Empty slide");
          }
          const params = {
            text: subslide.text,
            langCode: article.langCode,
            speakersProfile: article.speakersProfile,
            speakerNumber: subslide.speakerProfile.speakerNumber,
            targetPath: audioPath,
            outputFormat: "mp3",
            audioSpeed: subslide.audioSpeed,
          };
          // generate tts for slide
          return textToSpeechService.convertTextToSpeech(params, audioPath);
        })
        .then(() => {
          // TODO: Dont rely on tts engine to control audio speed
          // change audio speed here via the audio processor
          return fileUtils.getAudioDuration(audioPath);
        })
        .then((duration) => {
          audioDuration = duration / 1000;
          // upload file
          return storageService.saveFile(
            TRANSLATION_AUDIO_DIRECTORY,
            audioPath.split("/").pop(),
            fs.createReadStream(audioPath)
          );
        })
        .then((uploadRes) => {
          // update database
          fs.unlink(audioPath, (err) => {
            if (err) {
              console.log("error deleting tts audio", err);
            }
          });
          uploadedAudioUrl = uploadRes.url;
          const articleUpdate = {
            audio: uploadRes.url,
            rawAudio: uploadRes.url,
            audioSynced: true,
            audioKey: uploadRes.data.Key,
            audioFileName: audioPath.split("/").pop(),
            audioUser: userId,
            audioProcessed: true,
            audioSource: "tts",
            audioDuration,
          };
          return articleService.updateSubslideUsingPosition(
            article._id,
            slidePosition,
            subslidePosition,
            articleUpdate
          );
        })
        .then(() => {
          // delete old file
          if (subslide.audioFileName) {
            storageService
              .deleteFile(TRANSLATION_AUDIO_DIRECTORY, subslide.audioFileName)
              .then(() => {
                console.log("deleted file");
              })
              .catch((err) => {
                console.log("error deleting file", err);
              });
          }
          resolve({ audio: uploadedAudioUrl, audioDuration });
        })
        .catch(reject);
    });
  }

  updateTTSSlideAudioSpeed(
    articleId,
    slidePosition,
    subslidePosition,
    audioSpeed,
    userId
  ) {
    return new Promise((resolve, reject) => {
      articleService
        .updateSubslideUsingPosition(
          articleId,
          slidePosition,
          subslidePosition,
          { audioSpeed }
        )
        .then(() => {
          return this.generateSlideTextToSpeech(
            articleId,
            slidePosition,
            subslidePosition,
            userId
          );
        })
        .then((res) => resolve(res))
        .catch(reject);
    });
  }

  updateSlideAudioSpeed(
    articleId,
    slidePosition,
    subslidePosition,
    audioSpeed,
    userId
  ) {
    return new Promise((resolve, reject) => {
      let audioFileName;
      let originalAudio;
      articleService
        .findById(articleId)
        .then((article) => {
          const subslide = article.slides
            .find((s) => s.position === parseInt(slidePosition))
            .content.find((s) => s.position === parseInt(subslidePosition));
          originalAudio = subslide.rawAudio || subslide.audio;
          audioFileName = `speeded_audio_${uuid()}.${originalAudio
            .split(".")
            .pop()}`;
          return this.audioProcessorWorker.speedAudioViaApi({
            url: originalAudio,
            speed: audioSpeed,
          });
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
          return new Promise((resolve, reject) => {
            let update = {};
            fileUtils
              .getAudioDuration(audioFileName)
              .then((duration) => {
                update = {
                  audioDuration: duration / 1000,
                  audioSpeed,
                  audio: uploadRes.url,
                  audioKey: uploadRes.data.Key,
                  audioFileName,
                  audioUser: userId,
                  rawAudio: originalAudio,
                };
                fs.unlink(audioFileName, () => {});
                return articleService.updateSubslideUsingPosition(
                  articleId,
                  slidePosition,
                  subslidePosition,
                  update
                );
              })
              .then(() => resolve(update))
              .catch(reject);
          });
        })
        .then((updates) => {
          resolve(updates);
        })
        .then((res) => resolve(res))
        .catch(reject);
    });
  }

  generateTTSArticle(articleId, langCode) {
    return new Promise((resolve) => {
      let clonedArticle;
      articleService
        .cloneArticle(articleId)
        .then((clonedArticleDoc) => {
          clonedArticle = clonedArticleDoc;
          if (clonedArticle.toObject) {
            clonedArticle = clonedArticle.toObject();
          }
          clonedArticle.slides.forEach((slide) => {
            slide.content.forEach((subslide) => {
              if (
                subslide.speakerProfile &&
                subslide.speakerProfile.speakerNumber === -1
              ) {
                console.log("");
              } else {
                subslide.audio = "";
              }
            });
          });
          const newArticleUpdate = {
            articleType: "translation",
            langCode,
            slides: clonedArticle.slides,
            tts: true,
            translationProgress: 100,
            archived: false,
          };
          newArticleUpdate.tts = true;
          clonedArticle = {
            ...clonedArticle,
            ...newArticleUpdate,
          };
          return articleService.update(
            { _id: clonedArticle._id },
            newArticleUpdate
          );
        })
        .then(() => {
          return new Promise((resolve) => {
            const generateTTSFuncArray = [];
            clonedArticle.slides.forEach((slide) => {
              slide.content.forEach((subslide) => {
                generateTTSFuncArray.push((cb) => {
                  let audioPath;
                  this.generateSlideTextToSpeech(
                    clonedArticle._id,
                    slide.position,
                    subslide.position
                  )
                    .then(() => {
                      cb();
                    })
                    .catch((err) => {
                      console.log(err);
                      if (audioPath) {
                        fs.unlink(audioPath, (err) => {
                          if (err) {
                            console.log("error dleting tts audio", err);
                          }
                        });
                      }
                      cb();
                    });
                });
              });
            });
            async.series(generateTTSFuncArray, (err) => {
              console.log(
                "done generating tts for directly to english article",
                err
              );
              resolve();
            });
          });
        })
        .catch((err) => {
          console.log("err", err);
          resolve();
        });
    });
  }
  notifyUsersNextTranslationStage(articleId, nextStage) {
    return new Promise((resolve, reject) => {
      let emailFunc = null;
      let usersProperty = null;
      let article;
      let organization;
      articleService
        .findById(articleId)
        .then((a) => {
          article = a;
          if (nextStage === "text_translation_done") {
            emailFunc = emailService.notifyUserTextTranslationStageDone;
            usersProperty = "verifiers";
          } else if (nextStage === "signlanguage_translation_done") {
            emailFunc = emailService.notifyUserSignlanguageTranslationStageDone;
            usersProperty = "verifiers";
          } else if (nextStage === "voice_over_translation") {
            emailFunc = emailService.notifyUserVoiceoverTranslationStageReady;
            usersProperty = "translators";
          } else if (nextStage === "voice_over_translation_done") {
            emailFunc = emailService.notifyUserVoiceoverTranslationStageDone;
            usersProperty = "verifiers";
          } else {
            throw new Error("Unsupported next stage");
          }
          return organizationService.findById(article.organization);
        })
        .then((org) => {
          organization = org;

          const fetchUserFuncArray = [];
          console.log(article[usersProperty]);
          article[usersProperty].forEach((userId) => {
            if (typeof userId === "object") {
              userId = userId.user;
            }
            fetchUserFuncArray.push((cb) => {
              userService
                .findById(userId)
                .then((user) => {
                  return cb(null, user);
                })
                .catch((err) => {
                  console.log(err);
                  return cb();
                });
            });
          });

          async.parallelLimit(fetchUserFuncArray, 2, (err, users) => {
            if (err) return reject(err);
            users = users.filter((u) => u);
            const emailUsersFuncArray = [];
            users.forEach((user) => {
              emailUsersFuncArray.push((cb) => {
                authService
                  .generateLoginToken(user._id)
                  .then((token) => {
                    return emailFunc({
                      to: user,
                      organizationName: organization.name,
                      videoTitle: article.title,
                      articleId,
                      inviteToken: token,
                      organizationId: organization._id,
                    });
                  })
                  .then(() => {
                    cb();
                  })
                  .catch((err) => {
                    console.log(err);
                    cb();
                  });
              });
            });

            async.parallelLimit(emailUsersFuncArray, 2, () => {
              resolve();
            });
          });
        })
        .catch(reject);
    });
  }

  notifyVerifiersTextTranslationDone(articleId) {
    return this.notifyUsersNextTranslationStage(
      articleId,
      "text_translation_done"
    );
  }

  notifyVerifiersSignlanguageTranslationDone(articleId) {
    return this.notifyUsersNextTranslationStage(
      articleId,
      "signlanguage_translation_done"
    );
  }

  notifyVoiceoverTranslatorsTranslationReadyForVoiceover(articleId) {
    return this.notifyUsersNextTranslationStage(
      articleId,
      "voice_over_translation"
    );
  }

  notifyVerifiersVoiceoverTranslationDone(articleId) {
    return this.notifyUsersNextTranslationStage(
      articleId,
      "voice_over_translation_done"
    );
  }
}

module.exports = ({ workers }) => new TranslationService({ workers });

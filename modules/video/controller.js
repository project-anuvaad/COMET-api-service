const fs = require("fs");
const async = require("async");
const Video = require("../shared/models").Video;

const {
  articleService,
  userService,
  authService,
  emailService,
  organizationService,
  storageService,
} = require("../shared/services");

const {
  TIME_FOR_VIDEOWIKI_TO_CUT,
  DEFAULT_SINGLESLIDE_ENDTIME,
  supportedTranscribeLangs,
  BACKGROUND_MUSIC_DIRECTORY,
} = require("./constants");

const VW_SUPER_TRANSCRIBERS_EMAILS = process.env.VW_SUPER_TRANSCRIBERS_EMAILS
  ? process.env.VW_SUPER_TRANSCRIBERS_EMAILS.split(",").filter((s) => s)
  : [];

const fileUtils = require("./fileUtils");
const { notifyWhatsappVideoAvailableToCut } = require("./rabbitmqHandlers");
const VEHDI_ORG_ID = "5dd23585b4703d001108bbb1";
const SILENCE_THREASHOLD = 0.1; // silence threashold in seconds

const controller = ({ workers }) => {
  const { exporterWorker, transcriberWorker, spleeterWorker } = workers;

  const {
    generateWhatsappProofreadLink,
    applyTranscriptionOnArticle,
    canVideoAITranscribe,
    genrateTranscribeMessage,
    getVideoWithRelatedUsers,
    notifyUserVideoProofreadingReady,
    transcribeVideosQueue,
    notifyUserAITranscriptionFinished,
    generateOriginalArticle,
    applySubtitlesOnArticle,
    startVideoAutomatedCutting,
  } = require("./utils")({ workers });

  return {
    uploadVideo: function (req, res) {
      // 1- Create new video instance
      // 2- Upload file to s3
      // 3- Send to the exporter to transcribe it
      const { title, numberOfSpeakers, langCode, organization, url } = req.body;
      let file = req.files && req.files.find((f) => f.fieldname === "video");
      let subtitle;
      let backgroundMusic;
      if (req.files && req.files.find((f) => f.fieldname === "subtitle")) {
        subtitle = req.files.find((f) => f.fieldname === "subtitle");
        if (subtitle.originalname.split(".").pop() !== "srt") {
          return res.status(400).send("Allowed subtitles extensions: .srt");
        }
      }
      if (
        req.files &&
        req.files.find((f) => f.fieldname === "backgroundMusic")
      ) {
        backgroundMusic = req.files.find(
          (f) => f.fieldname === "backgroundMusic"
        );
      }
      let uploadFilePromise;
      if (file) {
        uploadFilePromise = storageService.saveFile(
          "videos",
          file.filename,
          fs.createReadStream(file.path)
        );
      } else if (url) {
        uploadFilePromise = new Promise((resolve, reject) => {
          fileUtils
            .downloadFile(url)
            .then((filePath) => {
              file = { path: filePath };
              return storageService.saveFile(
                "videos",
                filePath.split("/").pop(),
                fs.createReadStream(filePath)
              );
            })
            .then((data) => {
              return resolve(data);
            })
            .catch(reject);
        });
      } else {
        return res.status(400).send("Please upload video file or a video url");
      }
      // if (process.env.NODE_ENV === 'production') {
      //     console.log('======================= Uploading to s3 ======================== ');
      //     uploadFilePromise = storageService.saveFile('videos', file.filename, fs.createReadStream(file.path))
      // } else {
      //     uploadFilePromise = new Promise((resolve) => resolve({url: file.path, data: { Key: file.filename } }));
      // }
      let video;
      const videoData = {
        title,
        status: "uploading",
        numberOfSpeakers,
        langCode,
        uploadedBy: req.user._id,
      };
      if (canVideoAITranscribe(videoData)) {
        videoData.canAITranscribe = true;
      } else {
        videoData.canAITranscribe = false;
      }
      if (subtitle) {
        videoData.withSubtitle = true;
      }
      if (organization) {
        videoData.organization = organization;
      }
      Video.create(videoData)
        .then((doc) => {
          video = doc.toObject();
          return uploadFilePromise;
        })
        .catch((err) => {
          console.log("error from controller upload file", err);
          res.status(400).send("Something went wrong while uploading file");
          return Promise.reject();
        })
        .then((result) => {
          fs.unlink(file.path, () => {});
          const { url, data } = result;
          const Key = data.Key;
          video.Key = Key;
          video.url = url;
          video.status = "uploaded";

          return Video.update(
            { _id: video._id },
            { $set: { Key, url, status: "uploaded" } }
          );
        })
        .then(() => fileUtils.getFileDuration(video.url))
        .then((videoDuration) => {
          video.duration = videoDuration;
          return Video.update(
            { _id: video._id },
            { $set: { duration: videoDuration } }
          );
        })
        .then((doc) => {
          // Generate thumbnail image
          if (video.organization.toString() === VEHDI_ORG_ID) {
            notifyWhatsappVideoAvailableToCut(video);
          }
          exporterWorker.generateVideoThumbnail({
            id: video._id,
            videoUrl: video.url
          });
          // Upload subtitle
          if (subtitle) {
            let subtitlesUrl;
            let originalArticle;
            storageService
              .saveFile(
                "subtitles",
                subtitle.filename,
                fs.createReadStream(subtitle.path)
              )
              .then((result) => {
                const { url } = result;
                subtitlesUrl = url;
                video.subtitle = url;
                return Video.update(
                  { _id: video._id },
                  { $set: { subtitle: url, status: "cutting" } }
                );
              })
              .then(() => {
                return generateOriginalArticle({
                  videoId: video._id,
                  cuttingBy: "self",
                  user: req.user,
                });
              })
              .then((article) => {
                originalArticle = article;
                fs.unlink(subtitle.path, () => {});
                return applySubtitlesOnArticle(article._id, subtitlesUrl);
              })
              .then(() => {
                return Video.findByIdAndUpdate(video._id, {
                  $set: {
                    article: originalArticle._id,
                    status: "proofreading",
                  },
                });
              })
              .then((v) => Video.findById(video._id))
              .then((video) => res.json(video))
              .catch((err) => {
                console.log(err);
                Video.update(
                  { _id: video._id },
                  { $set: { withSubtitle: false } }
                ).then(() => res.json(video));
              });
          } else {
            res.json(video);
          }
          // Upload backgroundMusic
          if (backgroundMusic) {
            console.log("uploading background music", backgroundMusic);
            storageService
              .saveFile(
                "backgroundMusic",
                backgroundMusic.filename,
                fs.createReadStream(backgroundMusic.path)
              )
              .then((result) => {
                // backgroundMusicUrl
                // backgroundMusicKey
                const { url } = result;
                video.backgroundMusicUrl = url;
                return Video.update(
                  { _id: video._id },
                  {
                    $set: {
                      backgroundMusicUrl: url,
                      backgroundMusicKey: result.data.Key,
                    },
                  }
                );
              })
              .then(() => {
                console.log("uploaded bg music");
                fs.unlink(backgroundMusic.path, () => {});
              })
              .catch((err) => {
                console.log("error uploading background music", err);
              });
          }
        })
        .catch((err) => {
          console.log(err);
          fs.unlink(file.path, () => {});
          Video.update({ _id: video._id }, { $set: { status: "failed" } });
        });
    },

    updateVideo: function (req, res) {
      const { id } = req.params;
      const changes = req.body;
      let subtitle;
      let backgroundMusic;
      if (req.files && req.files.find((f) => f.fieldname === "subtitle")) {
        subtitle = req.files.find((f) => f.fieldname === "subtitle");
      }
      if (
        req.files &&
        req.files.find((f) => f.fieldname === "backgroundMusic")
      ) {
        backgroundMusic = req.files.find(
          (f) => f.fieldname === "backgroundMusic"
        );
      }
      if (changes.backgroundMusic === "") {
        changes.backgroundMusicUrl = "";
        delete changes.backgroundMusic;
      }
      let video;
      let archiveArticles = false;
      Video.findById(id)
        .then((videoDoc) => {
          if (!videoDoc) throw new Error("Invalid video id");
          video = videoDoc.toObject();
          if (!changes || Object.keys(changes).length === 0)
            return Promise.resolve();

          // If the langCode changed, put the video back to uploaded state
          if (changes.langCode && changes.langCode !== video.langCode) {
            changes.status = "uploaded";
            changes.jobName = "";
            changes.transcriptionUrl = "";
            changes.transcripingProgress = 0;
            changes.article = null;
            archiveArticles = true;
          }
          return Video.update({ _id: id }, { $set: changes });
        })
        .then(() => {
          // Subtitles upload if exists
          return new Promise((resolve, reject) => {
            if (subtitle) {
              storageService
                .saveFile(
                  "subtitles",
                  subtitle.filename,
                  fs.createReadStream(subtitle.path)
                )
                .then((result) => {
                  const { url } = result;
                  video.subtitle = url;
                  return Video.update(
                    { _id: video._id },
                    { $set: { subtitle: url, status: "cutting" } }
                  );
                })
                .then(() => Video.findById(video._id))
                .then(() => {
                  fs.unlink(subtitle.path, () => {});
                  if (!video.article) {
                    // Generate original article
                    // Apply subtitles on article
                    let originalArticle;
                    generateOriginalArticle({
                      videoId: video._id,
                      cuttingBy: "self",
                      user: req.user,
                    })
                      .then((article) => {
                        originalArticle = article;
                        return Video.findByIdAndUpdate(video._id, {
                          $set: { article: article._id },
                        });
                      })
                      .then(() =>
                        applySubtitlesOnArticle(
                          originalArticle._id,
                          video.subtitle
                        )
                      )
                      .then(() => {
                        return Video.findByIdAndUpdate(video._id, {
                          $set: { status: "proofreading" },
                        });
                      })
                      .then(() => {
                        resolve();
                      })
                      .catch(reject);
                  } else {
                    // apply subtitles on article
                    applySubtitlesOnArticle(video.article, video.subtitle)
                      .then(() => {
                        return Video.findByIdAndUpdate(video._id, {
                          $set: { status: "proofreading" },
                        });
                      })
                      .then(() => resolve())
                      .catch(reject);
                  }
                })
                .catch((err) => {
                  Video.update(
                    { _id: video._id },
                    { $set: { withSubtitle: false } }
                  );
                  reject(err);
                });
            } else {
              return resolve();
            }
          });
        })
        .then(() => {
          return new Promise((resolve, reject) => {
            // Background music upload if exists
            // Upload backgroundMusic
            if (backgroundMusic) {
              storageService
                .saveFile(
                  "backgroundMusic",
                  backgroundMusic.filename,
                  fs.createReadStream(backgroundMusic.path)
                )
                .then((result) => {
                  // backgroundMusicUrl
                  // backgroundMusicKey
                  const { url } = result;
                  video.backgroundMusicUrl = url;
                  return Video.update(
                    { _id: video._id },
                    {
                      $set: {
                        backgroundMusicUrl: url,
                        backgroundMusicKey: result.data.Key,
                      },
                    }
                  );
                })
                .then(() => {
                  fs.unlink(backgroundMusic.path, () => {});
                  resolve();
                })
                .catch((err) => {
                  console.log(err);
                  reject();
                });
            } else {
              return resolve();
            }
          });
        })
        .then(() => Video.findById(id))
        .then((videoDoc) => {
          return new Promise((resolve) => {
            let video = videoDoc.toObject();
            video.canAITranscribe = canVideoAITranscribe(video);
            Video.update(
              { _id: video._id },
              { $set: { canAITranscribe: video.canAITranscribe } }
            )
              .then(() => {
                resolve(video);
              })
              .catch((err) => {
                console.log(err);
                resolve(video);
              });
          });
        })
        .then((video) => {
          // If the title or number of speaker changed, map changes to all related articles
          if (changes.title || changes.numberOfSpeakers) {
            const articleChages = {};
            if (changes.title) {
              articleChages.title = changes.title;
            }
            if (changes.numberOfSpeakers) {
              articleChages.numberOfSpeakers = changes.numberOfSpeakers;
            }
            articleService
              .update({ video: id }, articleChages, { multi: true })
              .then((r) => {
                console.log(
                  "update article due to video change",
                  articleChages,
                  r
                );
              })
              .catch((err) => {
                console.log("error update article due to video change", err);
              });
          }
          return res.json({ video });
        })
        .then(() => {
          // Archive old articles if langCode changed, look condition above
          if (archiveArticles) {
            articleService
              .update({ video: id }, { archived: true }, { multi: true })
              .then((r) => {
                console.log("archived articles", r);
              })
              .catch((err) => {
                console.log("error archiving articles", err);
              });
          }
        })
        .catch((err) => {
          return res.status(400).send(err.message);
        });
    },

    uploadBackgroundMusic: function (req, res) {
      const file = req.files.find((f) => f.fieldname === "file");
      const { id } = req.params;
      let video;
      let newBackgroundMusicUrl;
      Video.findById(id)
        .then((videoDoc) => {
          if (!videoDoc) throw new Error("Invalid video id");
          video = videoDoc.toObject();
          return storageService.saveFile(
            BACKGROUND_MUSIC_DIRECTORY,
            file.filename,
            fs.createReadStream(file.path)
          );
        })
        .then((uploadRes) => {
          // Delete old file if exiists
          if (video.backgroundMusicKey) {
            storageService
              .deleteFile(video.backgroundMusicKey)
              .then((d) => {
                console.log("deleted old background music file", d);
              })
              .catch((err) => {
                console.log("error deleting file", err);
              });
          }
          newBackgroundMusicUrl = uploadRes.url;
          const videoUpdate = {
            backgroundMusicUrl: uploadRes.url,
            backgroundMusicKey: uploadRes.data.Key,
            backgroundMusicTransposed: false,
            hasBackgroundMusic: true,
          };
          return Video.update({ _id: id }, { $set: videoUpdate });
        })
        .then(() => {
          fs.unlink(file.path, (err) => {
            if (err) {
              console.log("error removing tmp file", err);
            }
          });
          video.backgroundMusicUrl = newBackgroundMusicUrl;
          return res.json({ video });
        })
        .catch((err) => {
          console.log(err);
        });
    },

    deleteBackgroundMusic: function (req, res) {
      const { id } = req.params;
      let video;
      Video.findById(id)
        .then((videoDoc) => {
          video = videoDoc.toObject();
          if (!video.backgroundMusicKey)
            throw new Error("The video doesnt have background music");
          return storageService.deleteFile(video.backgroundMusicKey);
        })
        .then(() => {
          return Video.update(
            { _id: id },
            {
              $set: {
                backgroundMusicKey: "",
                backgroundMusicUrl: "",
                backgroundMusicTransposed: false,
              },
            }
          );
        })
        .then(() => Video.findById(id))
        .then((video) => {
          return res.json({ video: video.toObject() });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    extractVideoBackgroundMusic: function (req, res) {
      const { id } = req.params;
      let video;
      Video.findById(id)
        .then((videoDoc) => {
          video = videoDoc.toObject();
          // if (video.extractBackgroundMusicLoading) throw new Error('Extracting background music already in progress');
          return spleeterWorker.extractVideoBackgroundMusic({
            id: video._id,
            url: video.url,
          });
        })
        .then(() => {
          return Video.update(
            { _id: id },
            {
              $set: {
                extractBackgroundMusicLoading: true,
                extractBackgroundMusicBy: req.user._id,
              },
            }
          );
        })
        .then(() => Video.findById(id))
        .then((video) => {
          return res.json({ video: video.toObject() });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    updateReviewers: function (req, res) {
      const { id } = req.params;
      const { reviewers } = req.body;
      const newReviewers = [];
      let video;
      Video.findById(id)
        .then((videoDoc) => {
          video = videoDoc.toObject();
          if (video.status === 'uploaded') {
            startVideoAutomatedCutting(id, req.user)
            .then(() => {
              console.log('started automated cutting', id)
            })
            .catch(err => {
              console.log('error starting automated cutting', err);
            })
          }
          if (reviewers && reviewers.length > 0) {
            const oldReviewers = video.reviewers.map((r) => r.toString());
            reviewers.forEach((reviewer) => {
              if (oldReviewers.indexOf(reviewer) === -1) {
                newReviewers.push(reviewer);
              }
            });
          }
          return Video.update({ _id: id }, { $set: { reviewers } });
        })
        .then(() => {
          return res.json({ reviewers });
        })
        .then(() => organizationService.findById(video.organization))
        .then((organizationDoc) => {
          video.organization = organizationDoc;
          if (newReviewers.length > 0) {
            newReviewers.forEach((reviewer) => {
              let user;
              userService
                .findById(reviewer)
                .then((userDoc) => {
                  user = userDoc.toObject();
                  return authService.generateLoginToken(user._id);
                })
                .then((token) => {
                  return emailService.inviteUserToReview({
                    from: req.user,
                    to: user,
                    videoId: id,
                    organizationName: video.organization.name,
                    organizationId: video.organization._id,
                    videoTitle: video.title,
                    inviteToken: token,
                    whatsappUrl: generateWhatsappProofreadLink(id),
                  });
                })
                .catch((err) => {
                  console.log("Error sending email to user", err);
                });
            });
          }
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    resendEmailToReviewer: function (req, res) {
      const { id } = req.params;
      const { userId } = req.body;
      let video;
      let organization;
      let user;
      Video.findById(id)
        .then((v) => {
          if (!v) throw new Error("Invalid video id");
          video = v;
          if (video.reviewers.map((v) => v.toString()).indexOf(userId) === -1) {
            throw new Error(
              "This user is not assigned as a reviewer in this video"
            );
          }
          return userService.findById(userId);
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        })
        .then((u) => {
          user = u;
          return organizationService.findById(video.organization);
        })
        .then((org) => {
          organization = org;
          return authService.generateLoginToken(user._id);
        })
        .then((token) => {
          res.json({ success: true });
          return emailService.inviteUserToReview({
            from: req.user,
            to: user,
            videoId: id,
            organizationName: organization.name,
            organizationId: organization._id,
            videoTitle: video.title,
            inviteToken: token,
          });
        })
        .then(() => {})
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    updateVerifiers: function (req, res) {
      const { id } = req.params;
      const { verifiers } = req.body;
      const newVerifiers = [];
      let video;
      Video.findById(id)
        .then((videoDoc) => {
          video = videoDoc.toObject();
          if (video.status === 'uploaded') {
            startVideoAutomatedCutting(id, req.user)
            .then(() => {
              console.log('started automated cutting', id)
            })
            .catch(err => {
              console.log('error starting automated cutting', err);
            })
          }
          if (verifiers && verifiers.length > 0) {
            const oldVerifiers = video.verifiers.map((r) => r && r.toString());
            verifiers.forEach((reviewer) => {
              if (oldVerifiers.indexOf(reviewer) === -1) {
                newVerifiers.push(reviewer);
              }
            });
          }
          return Video.update({ _id: id }, { $set: { verifiers } });
        })
        .then(() => {
          return res.json({ verifiers });
        })
        .then(() => organizationService.findById(video.organization))
        .then((organization) => {
          video.organization = organization;
          if (newVerifiers.length > 0) {
            newVerifiers.forEach((reviewer) => {
              let user;
              userService
                .findById(reviewer)
                .then((userDoc) => {
                  user = userDoc.toObject();
                  return authService.generateLoginToken(user._id);
                })
                .then((token) => {
                  return emailService.inviteUserToVerifyVideo({
                    from: req.user,
                    to: user,
                    videoId: id,
                    organizationName: video.organization.name,
                    organizationId: video.organization._id,
                    videoTitle: video.title,
                    inviteToken: token,
                  });
                })
                .catch((err) => {
                  console.log("Error sending email to user", err);
                });
            });
          }
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    updateProjectLeaders: function (req, res) {
      const { id } = req.params;
      const { projectLeaders } = req.body;
      const newProjectLeaders = [];
      let video;
      Video.findById(id)
        .then((videoDoc) => {
          video = videoDoc.toObject();
          if (projectLeaders && projectLeaders.length > 0) {
            const oldProjectLeaders = video.projectLeaders.map(
              (r) => r && r.toString()
            );
            projectLeaders.forEach((reviewer) => {
              if (oldProjectLeaders.indexOf(reviewer) === -1) {
                newProjectLeaders.push(reviewer);
              }
            });
          }
          return Video.update({ _id: id }, { $set: { projectLeaders } });
        })
        .then(() => {
          return res.json({ projectLeaders });
        })
        .then(() => organizationService.findById(video.organization))
        .then((organization) => {
          video.organization = organization;
          if (video.article) {
            articleService
              .findById(video.article)
              .then((originalArticle) =>
                articleService.updateMany(
                  { originalArticle: originalArticle._id },
                  {
                    projectLeaders: projectLeaders.map((user) => ({
                      user,
                      invitationStatus: "accepted",
                      invitedBy: req.user._id,
                    })),
                  }
                )
              )
              .then(() => {
                console.log("updated project leaders on articles");
              })
              .catch((err) => {
                console.log(
                  "error updating project leaders of original article",
                  err
                );
              });
          }
          if (newProjectLeaders.length > 0) {
            newProjectLeaders.forEach((reviewer) => {
              let user;
              userService
                .findById(reviewer)
                .then((userDoc) => {
                  user = userDoc.toObject();
                  return authService.generateLoginToken(user._id);
                })
                .then((token) => {
                  return emailService.inviteUserToLeadVideoTranslations({
                    from: req.user,
                    to: user,
                    videoId: id,
                    organizationName: video.organization.name,
                    organizationId: video.organization._id,
                    videoTitle: video.title,
                    inviteToken: token,
                  });
                })
                .catch((err) => {
                  console.log("Error sending email to user", err);
                });
            });
          }
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    resendEmailToVerifier: function (req, res) {
      const { id } = req.params;
      const { userId } = req.body;
      let video;
      let organization;
      let user;
      Video.findById(id)
        .then((v) => {
          if (!v) throw new Error("Invalid video id");
          video = v;
          if (video.verifiers.map((v) => v.toString()).indexOf(userId) === -1) {
            throw new Error(
              "This user is not assigned as a verifier in this video"
            );
          }
          return userService.findById(userId);
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        })
        .then((u) => {
          user = u;
          return organizationService.findById(video.organization);
        })
        .then((org) => {
          organization = org;
          return authService.generateLoginToken(user._id);
        })
        .then((token) => {
          res.json({ success: true });

          return emailService.inviteUserToVerifyVideo({
            from: req.user,
            to: user,
            videoId: id,
            organizationName: organization.name,
            organizationId: organization._id,
            videoTitle: video.title,
            inviteToken: token,
          });
        })
        .then(() => {})
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    getVideos: function (req, res) {
      const perPage = 10;
      let { organization, page, search } = req.query;

      const query = {};
      if (organization) {
        query.organization = organization;
      }
      const queryKeys = Object.keys(req.query);
      // Remove page if it's in the query
      if (queryKeys.indexOf("page") !== -1) {
        delete req.query.page;
      }

      if (queryKeys.indexOf("search") !== -1) {
        query.title = new RegExp(search, "ig");
        delete req.query.search;
      }

      if (page) {
        page = parseInt(page);
      } else {
        page = 1;
      }
      const skip = page === 1 || page === 0 ? 0 : page * perPage - perPage;

      Object.keys(req.query).forEach((key) => {
        if (req.query[key]) {
          query[key] = req.query[key];
        }
      });
      // Status field is a special case as it's an array
      if (req.query["status"]) {
        let statusList = [];
        if (Array.isArray(req.query.status)) {
          statusList = req.query.status;
        } else {
          statusList = req.query.status.split(",");
        }
        query.status = { $in: statusList };
      }
      let videos = [];
      Video.find({ ...query })
        .skip(skip)
        .limit(perPage)
        .sort({ created_at: -1 })
        .then((v) => {
          videos = v.map((video) => ({ ...video.toObject() }));
          return new Promise((resolve) => {
            const fetchVideosFuncArray = v.map((video, index) => (cb) => {
              getVideoWithRelatedUsers(video._id)
                .then((video) => {
                  video = {
                    ...video,
                    canAITranscribe: canVideoAITranscribe(video),
                  };
                  videos[index] = video;
                  // if no specific organization is required, fetch the video's organization info
                  if (organization) {
                    return cb();
                  }
                  organizationService
                    .findById(video.organization)
                    .then((org) => {
                      videos[index].organization = org;
                      return cb();
                    })
                    .catch((err) => {
                      console.log(err);
                      return cb();
                    });
                })
                .catch((err) => {
                  console.log(err);
                  return cb();
                });
            });
            async.parallelLimit(fetchVideosFuncArray, 2, () => {
              return resolve(videos);
            });
          });
        })
        .then(() => {
          return Video.count(query);
        })
        .then((count) => {
          return res.json({
            videos,
            pagesCount: Math.ceil(count / perPage),
            totalCount: count,
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    getVideosCount: function (req, res) {
      const { organization } = req.query;
      let proofread = 0,
        completed = 0,
        cutting = 0;
      // Transcribe videos
      Video.count({ organization, status: { $in: ["uploaded", "cutting", "automated_cutting"] } })
        .then((count) => {
          cutting = count;
          // Proofread videos
          return Video.count({ organization, status: "proofreading" });
        })
        .then((count) => {
          proofread = count;
          // Completed Videos
          return Video.count({ organization, status: "done" });
        })
        .then((count) => {
          completed = count;
          return res.json({
            cutting,
            proofread,
            completed,
            total: cutting + proofread + completed,
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    getVideoById: function (req, res) {
      const { id } = req.params;
      getVideoWithRelatedUsers(id, ["transcriptionScriptContent"])
        .then((video) => {
          return res.json(video);
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    deleteVideo: function (req, res) {
      const { id } = req.params;
      Video.findById(id)
        .then(() => {
          return Video.remove({ _id: id });
        })
        .then(() => {
          return articleService.find({ video: id });
        })
        .then(() => {
          return articleService.remove({ video: id });
        })
        .then(() => {
          return res.json({ success: true });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send("Something went wrong");
        });
    },

    transcribeAllVideos: function (req, res) {
      const { organization } = req.body;
      const transcribeQueue = transcribeVideosQueue();
      Video.count({ organization, status: "uploaded" })
        .then((count) => {
          if (count === 0) {
            throw new Error("No videos to be transcribed");
          }
          const limitPerOperation = 1;
          for (let i = 0; i < count; i += limitPerOperation) {
            transcribeQueue.push({
              skip: 0,
              limit: limitPerOperation,
              organization,
            });
          }
          transcribeQueue.drain(function () {
            return res.json({ success: true, queued: true });
          });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    transcribeVideo: function (req, res) {
      const { id } = req.params;
      let video;
      let article;
      let newClonedArticle;
      Video.findById(id)
        .then((videoDoc) => {
          if (!videoDoc) {
            throw new Error("Invalid video id");
          }
          video = videoDoc;
          if (video.article) {
            return articleService.find({ _id: video.article });
          }
          return Promise.resolve([]);
        })
        .then((articleDocs) => {
          // If there's already existing articles
          // Then the user is requesting a re-review
          if (articleDocs && articleDocs.length > 0) {
            article = articleDocs[0];
            // If the article was already converted, clone the converted article for a new version of review
            if (article && article.converted) {
              return articleService
                .cloneArticle(article._id)
                .then((clonedArticle) => {
                  const lastVersion = article.version;
                  newClonedArticle = articleService.cleanArticleSilentSlides(
                    clonedArticle
                  );
                  return articleService.update(
                    { _id: newClonedArticle._id },
                    {
                      slides: newClonedArticle.slides,
                      version: lastVersion + 1,
                      converted: false,
                      archived: false,
                    }
                  );
                })
                .then(() => {
                  return Video.update(
                    { _id: id },
                    {
                      $set: {
                        status: "proofreading",
                        article: newClonedArticle._id,
                      },
                    }
                  );
                })
                .then(() => {
                  return res.json({ success: true, article: newClonedArticle });
                })
                .catch((err) => {
                  console.log(err);
                  return res.status(400).send(err.message);
                });
            } else {
              console.log("not cloning");
              return Video.update(
                { _id: id },
                { $set: { status: "proofreading" } }
              )
                .then(() => {
                  return res.json({ success: true, article: articleDocs[0] });
                })
                .catch((err) => {
                  console.log(err);
                  return res.status(400).send("Something went wrong");
                });
            }
          }
          if (video.jobName) {
            return res.json({ success: true, queued: true });
          }
          // If it's a supported transcribe lang, transcribe it
          // otherwise, create a dummy article and let the user fill in the text
          if (
            supportedTranscribeLangs
              .map((l) => l.code)
              .indexOf(video.langCode) !== -1
          ) {
            transcriberWorker.transcribeVideo(genrateTranscribeMessage(video));
            Video.update(
              { _id: video._id },
              { $set: { status: "transcriping" } }
            )
              .then(() => {
                return res.json({ success: true, queued: true });
              })
              .catch((err) => {
                console.log(err);
                return res.json({ success: true, queued: true });
              });
          } else {
            const initialSlide = {
              position: 0,
              content: [
                {
                  text: "",
                  position: 0,
                  startTime: 0,
                  endTime: DEFAULT_SINGLESLIDE_ENDTIME / 1000,
                  speakerProfile: {
                    speakerNumber: 1,
                    speakerGender: "male",
                  },
                },
              ],
            };
            const newArticle = {
              title: video.title,
              version: 1,
              slides: [initialSlide],
              video: video._id,
              numberOfSpeakers: video.numberOfSpeakers,
              langCode: video.langCode,
              speakersProfile: [
                {
                  speakerNumber: 1,
                  speakerGender: "male",
                },
              ],
              organization: video.organization,
              archived: false,
            };
            articleService
              .create(newArticle)
              .then((article) => {
                return Video.update(
                  { _id: video._id },
                  { $set: { status: "proofreading", article: article._id } }
                );
              })
              .then(() => {
                return res.json({ success: true, article: newArticle });
              })
              .catch((err) => {
                throw err;
              });
          }
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    automaticCutVideo: function(req, res) {
      const { id } = req.params;
      let video;
      let article;
      let videoUpdate;
      Video.findById(id)
      .then((v => {
        video = v.toObject();
        if (!video || video.status !== 'cutting') {
          throw new Error('Automatic break is only available in breaking stage')
        }
        return articleService.findById(video.article)
      }))
      .then(a => {
        article = a;
        videoUpdate = {
          status: 'automated_cutting',
          cuttingBy: 'self',
          cuttingRequestBy: req.user._id,
          cuttingStartTime: Date.now(),
        }
        if (video.duration) {
          // cutting end time is approx 1/2 video duration + 1min
          videoUpdate.cuttingEndTime = Date.now() + (video.duration / 2 * 1000) + 60 * 1000;
        }

        return Video.findByIdAndUpdate(id, { $set: videoUpdate })
      })
      .then(() => {
        spleeterWorker.extractVideoVoice({ id: article._id, url: video.url })
        return res.json(videoUpdate)
      })
      .catch(err => {
        console.log(err)
        return res.status(400).send(err.message);
      })
    },

    skipTranscribe: function (req, res) {
      const { id } = req.params;
      const { cuttingBy } = req.body;
      let video;
      Video.findById(id)
        .then((videoDoc) => {
          if (!videoDoc) throw new Error("Invalid video id");
          video = videoDoc.toObject();
          if (video.status !== 'uploaded') {
            throw new Error('This video is already being processed');
          }
          const initialSlide = {
            position: 0,
            content: [
              {
                text: "",
                position: 0,
                startTime: 0,
                endTime: DEFAULT_SINGLESLIDE_ENDTIME / 1000,
                speakerProfile: {
                  speakerNumber: 1,
                  speakerGender: "male",
                },
              },
            ],
          };
          const newArticle = {
            title: video.title,
            version: 1,
            slides: [initialSlide],
            video: video._id,
            numberOfSpeakers: video.numberOfSpeakers,
            langCode: video.langCode,
            speakersProfile: [
              {
                speakerNumber: 1,
                speakerGender: "male",
              },
            ],
            organization: video.organization,
          };
          articleService
            .create(newArticle)
            .then((newArticle) => {
              article = newArticle;
              const videoUpdate = {
                status: "automated_cutting",
                article: newArticle._id,
                cuttingBy: cuttingBy || "self",
                cuttingRequestBy: req.user._id,
              };
              videoUpdate.cuttingStartTime = Date.now();
              if (video.duration) {
                videoUpdate.transcribeStartTime = Date.now();
                if (
                  supportedTranscribeLangs
                    .map((l) => l.code)
                    .indexOf(video.langCode) !== -1
                ) {
                  // transcribe end time is approx. 2 times the video duration
                  videoUpdate.transcribeEndTime = Date.now() + (video.duration * 1000 * 2) 
                  videoUpdate.AITranscriptionLoading = true;
                } else {
                  videoUpdate.transcribeEndTime = Date.now();
                }
              }

              if (cuttingBy === "videowiki") {
                videoUpdate.cuttingEndTime =
                  Date.now() + TIME_FOR_VIDEOWIKI_TO_CUT;
              } else if (video.duration) {
                // cutting end time is approx 1/2 video duration + 1min
                videoUpdate.cuttingEndTime = Date.now() + (video.duration / 2 * 1000) + 60 * 1000;
                // // End time will be 1 minute for every 4 minutes of video duration plus an extra 1 mint
                // videoUpdate.cuttingEndTime = Date.now() + (video.duration / 4 * 1000) + 60 * 1000;
              }
              return Video.update({ _id: video._id }, { $set: videoUpdate });
            })
            .then(() => {
              res.json({ success: true, article: newArticle });
              spleeterWorker.extractVideoVoice({ id: article._id, url: video.url })

              if (
                supportedTranscribeLangs
                  .map((l) => l.code)
                  .indexOf(video.langCode) !== -1
              ) {
                transcriberWorker.transcribeVideo(
                  genrateTranscribeMessage(video)
                );
              }

              if (
                cuttingBy === "videowiki" &&
                VW_SUPER_TRANSCRIBERS_EMAILS.length > 0
              ) {
                VW_SUPER_TRANSCRIBERS_EMAILS.forEach((email) => {
                  userService
                    .findOne({ email })
                    .then((userData) => {
                      if (userData) {
                        // If the user is not in the organization, add them
                        if (
                          !userData.organizationRoles.find(
                            (role) =>
                              role.organization ===
                              video.organization.toString()
                          )
                        ) {
                          const newOrganizationRoles = userData.organizationRoles.slice();
                          newOrganizationRoles.push({
                            organization: video.organization,
                            permissions: ["review"],
                            inviteStatus: "accepted",
                          });

                          userService
                            .update(
                              { email },
                              { organizationRoles: newOrganizationRoles }
                            )
                            .then(() => {
                              console.log(
                                "super transcriber added to organization",
                                email,
                                video.organization
                              );
                            })
                            .catch((err) => {
                              console.log(err);
                            });
                        }
                        // Add the user as a reviewer
                        Video.findByIdAndUpdate(video._id, {
                          $addToSet: { reviewers: userData._id },
                        })
                          .then(() => {
                            console.log(
                              "added as reviewer",
                              video,
                              userData._id,
                              email
                            );
                          })
                          .catch((err) => {
                            console.log(err);
                          });
                      }
                    })
                    .catch((err) => {
                      console.log(err);
                    });
                });
              }
            })
            .catch((err) => {
              throw err;
            });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    },

    refreshMedia: function (req, res) {
      const { id } = req.params;
      const { articleId } = req.body;
      let video;
      let article;
      articleService
        .find({ _id: articleId, video: id })
        .then((articleDoc) => {
          if (!articleDoc) throw new Error("Invalid article/video id");
          return articleService.update(
            { _id: articleId },
            { refreshing: true }
          );
        })
        .then(() => Video.findById(id))
        .then((v) => {
          video = v;
          return articleService.findById(articleId)
        })
        .then((a) => {
          article = a;
          exporterWorker.convertVideoToArticle({
                id: video._id,
                videoUrl: video.compressedVideoUrl || video.url,
                slides: article.slides,
                speakersProfile: article.speakersProfile,
                toEnglish: article.toEnglish,
              });
          return res.json({ refreshing: true });
        })
        .catch((err) => {
          console.log("error refreshing media", err);
          return res.status(400).send(err.message);
        });
    },

    convertVideo: function (req, res) {
      const { id } = req.params;
      const { articleId } = req.body;
      let video;
      let article;
      Video.findById(id)
        .then((v) => {
          if (!v) throw new Error("Invalid video id");
          video = v;
          if (["cutting", "proofreading"].indexOf(video.status) === -1) {
            throw new Error("Someone is already converting this video");
          }
          if (video.status === "cutting") {
            let clonedArticle;
            return Video.update(
              { _id: id },
              { $set: { status: "proofreading" } }
            )
              .then(() => {
                // Notify cuttingRequestBy user that the video is ready for proofreading
                notifyUserVideoProofreadingReady(video._id);
                // Start job to transcribe video slices
                articleService
                  .findById(video.article)
                  .then((a) => {
                    return new Promise((resolve) => {
                      article = a;
                      const transcriptionLang = supportedTranscribeLangs.find(
                        (l) =>
                          l.code
                            .toLowerCase()
                            .indexOf(video.langCode.toLowerCase()) !== -1
                      );
                      if (
                        !transcriptionLang ||
                        transcriptionLang.vendor === "gcp"
                      ) {
                        return resolve();
                      }

                      // Create AI_Transcribe article
                      return articleService
                        .cloneArticle(article._id)
                        .then((ca) => {
                          clonedArticle = ca;
                          const clonedArticleUpdate = {
                            articleType: "transcription_version",
                            isAITranscription: true,
                            transcriptionArticle: article._id,
                            archived: false,
                          };
                          return articleService.updateById(
                            clonedArticle._id,
                            clonedArticleUpdate
                          );
                        })
                        .then(resolve)
                        .catch((err) => {
                          console.log(err);
                          resolve();
                        });
                    });
                  })
                  .then(() => {
                    return new Promise((resolve) => {
                      if (
                        video.transcriptionUrl ||
                        video.transcriptionScriptUrl
                      ) {
                        notifyUserAITranscriptionFinished(article._id);
                        if (video.transcriptionUrl) {
                          applyTranscriptionOnArticle(
                            clonedArticle._id,
                            video.transcriptionUrl
                          )
                            .then(() =>
                              applyTranscriptionOnArticle(
                                article._id,
                                video.transcriptionUrl
                              )
                            )
                            .then(() => {
                              resolve();
                            })
                            .catch((err) => {
                              console.log(err);
                              resolve();
                            });
                        } else {
                          resolve();
                        }
                      } else if (clonedArticle) {
                        const slides = article.slides.reduce((acc, s) => {
                          if (
                            s.content &&
                            s.content.length > 0 &&
                            s.content.filter(
                              (ss) => ss.speakerProfile.speakerNumber !== -1
                            ).length > 0
                          ) {
                            return acc.concat(
                              s.content
                                .filter(
                                  (ss) => ss.speakerProfile.speakerNumber !== -1
                                )
                                .map((ss) => ({
                                  slidePosition: s.position,
                                  subslidePosition: ss.position,
                                  startTime: ss.startTime,
                                  endTime: ss.endTime,
                                }))
                            );
                          }
                          return acc;
                        }, []);
                        const updateFuncArray = [];
                        slides.forEach((subslide) => {
                          updateFuncArray.push((cb) => {
                            articleService
                              .updateSubslideUsingPosition(
                                clonedArticle._id,
                                subslide.slidePosition,
                                subslide.subslidePosition,
                                { AITranscriptionLoading: true }
                              )
                              .then(() => {
                                console.log(
                                  "AITranscriptionLoading",
                                  subslide.slidePosition,
                                  subslide.subslidePosition
                                );
                                cb();
                              })
                              .catch((err) => {
                                console.log(err);
                                cb();
                              });
                          });
                        });
                        async.parallelLimit(updateFuncArray, 5, () => {
                          notifyUserAITranscriptionFinished(article._id);
                          resolve();
                        });
                      } else {
                        notifyUserAITranscriptionFinished(article._id);
                        resolve();
                      }
                    });
                  })
                  .then(() => {
                    res.json({ status: "proofreading" });
                  })
                  .catch((err) => {
                    console.log(err);
                    res.json({ status: "proofreading" });
                  });
              })
              .catch((err) => {
                console.log(err);
                return res.status(400).send("Something went wrong");
              });
          }
          return articleService
            .find({ video: video._id, _id: articleId })
            .then((a) => {
              if (!a || a.length === 0) throw new Error("Invalid article");
              // Sort the article's slides/subslides based on startTime before sending to the exporter
              article = a[0];
              if (article.toObject) {
                article = article.toObject();
              }
              const { slides } = article;
              slides.forEach((slide) => {
                slide.content = slide.content.sort(
                  (a, b) => a.startTime - b.startTime
                );
              });
              // merge slides content
              const subslides = slides
                .reduce((acc, slide) => acc.concat(slide.content), [])
                .sort((a, b) => a.startTime - b.startTime);
              // Find the silent parts and cut into separate sub-slides
              if (
                subslides
                  .filter((s) => s.speakerProfile.speakerNumber !== -1)
                  .find(
                    (s) =>
                      !s.text || !s.text.trim() || s.text.trim().length === 0
                  )
              ) {
                throw new Error(
                  "All Speaker Slides must have text associated with them"
                );
              }
              let newSubslides = [];
              /*
                        this part handles gaps between slides
                    */
              // subslides.forEach((subslide, index) => {
              //     // Handle intro part
              //     if (index === 0 && subslide.startTime !== 0 && subslide.startTime > SILENCE_THREASHOLD) {
              //         newSubslides.push({
              //             startTime: 0,
              //             endTime: subslide.startTime,
              //             text: '',
              //             silent: true,
              //         })
              //     }
              //     newSubslides.push(subslide);
              //     if (index !== subslides.length - 1) {
              //         // compare the current and prev slide startTime/endTime
              //         // if they don't match, add as a new subslide
              //         if (subslide.endTime <= subslides[index + 1].startTime && (subslides[index + 1].startTime - subslide.endTime) > SILENCE_THREASHOLD) {
              //             console.log('silence', subslides[index + 1].startTime - subslide.endTime)
              //             newSubslides.push({
              //                 startTime: subslide.endTime,
              //                 endTime: subslides[index + 1].startTime,
              //                 text: '',
              //                 silent: true,
              //             })
              //             console.log({
              //                 startTime: subslide.endTime,
              //                 endTime: subslides[index + 1].startTime,
              //                 text: '',
              //                 silent: true,
              //             })
              //         }
              //     } else {
              //         // Handle outro part
              //         if (video.duration && subslide.endTime < video.duration &&  (video.duration - subslide.endTime) > SILENCE_THREASHOLD) {
              //             newSubslides.push({
              //                 startTime: subslide.endTime,
              //                 endTime: video.duration,
              //                 text: '',
              //                 silent: true,
              //             })
              //         }
              //     }
              // })
              /*
                        Add gaps between slides to previous slide
                    */
              subslides.forEach((subslide, index) => {
                // First slide starts at 0
                if (index === 0) {
                  subslide.startTime = 0;
                }
                // Last slide, set its end time to the video duration
                if (index === subslides.length - 1) {
                  subslide.endTime = video.duration;
                } else {
                  subslide.endTime = subslides[index + 1].startTime;
                }
                newSubslides.push(subslide);
              });
              newSubslides = newSubslides.filter(
                (s) => s.endTime - s.startTime > SILENCE_THREASHOLD
              );
              // re-cut subslides to slides based on 10 seconds rule
              const newSlides = [];
              let newSlide = {
                content: [newSubslides[0]],
              };
              for (let i = 1; i < newSubslides.length; i++) {
                if (
                  newSlide.content.reduce(
                    (acc, s) => acc + (s.endTime - s.startTime),
                    0
                  ) >= 10
                ) {
                  newSlides.push(newSlide);
                  newSlide = {
                    content: [],
                  };
                }
                newSlide.content.push(newSubslides[i]);
              }

              if (newSlide.content.length > 0) {
                newSlides.push(newSlide);
              }

              const orderedSlides = newSlides.map((s, index) => ({
                ...s,
                position: index,
              }));

              const articleUpdate = {
                slides: orderedSlides,
              };
              return articleService.update({ _id: article._id }, articleUpdate);
            })
            .then(() => {
              const videoUpdate = {
                status: 'converting',
                convertedBy: req.user._id,
              }
              if (video.duration) {
                videoUpdate.convertStartTime = Date.now();
                // Convert end time will be 1/2 the video's duration
                videoUpdate.convertEndTime = Date.now() + (video.duration * 1000 * 1 / 2);
              }
              return Video.update(
                { _id: id },
                { $set: videoUpdate }
              );
            })
            .then(() => Video.findById(id))
            .then((v) => {
              video = v;
              return articleService.findById(article._id)
            })
            .then((a) => {
              article = a;
              return exporterWorker.convertVideoToArticle({
                id: video._id,
                videoUrl: video.compressedVideoUrl || video.url,
                slides: article.slides,
                speakersProfile: article.speakersProfile,
                toEnglish: article.toEnglish,
              });
            })
            .then(() => {
              return res.json({ queued: true });
            })
            .catch((err) => {
              console.log(err);
              return res.status(400).send(err.message);
            });
        })
        .catch((err) => {
          const reason = err.message || "Somthing went wrong";
          console.log(err);
          return res.status(400).send(reason);
        });
    },

    updateFolder: (req, res) => {
      const { id } = req.params;
      const { folder } = req.body;
      const query = folder ? { $set: { folder } } : { $unset: { folder } };
      Video.update({ _id: id }, query)
        .then(() => {
          return res.json({ folder });
        })
        .catch((err) => {
          console.log(err);
          res.status(400).send("Something went wrong");
        });
    },

    getVideoForWhatsApp: function (req, res) {
      const videoQuery = { organization: VEHDI_ORG_ID, status: "uploaded" };
      let video;
      Video.count(videoQuery)
        .then((count) => {
          const randomNumber = Math.floor(Math.random() * count);
          return Video.find({ ...videoQuery })
            .skip(randomNumber)
            .limit(1);
        })
        .then((videos) => {
          if (!videos || videos.length === 0) {
            return res.json({ video: null });
          }
          video = videos[0];
          res.json({ video });
          // Create a new article for the video
          // and set it in proofread stage
          video.status = "transriping";
          return Video.update(
            { _id: video._id },
            { $set: { status: "transcriping" } }
          );
        })
        .then(() => {
          console.log("Video transriping with whatsapp bot", video);
        })
        .catch((err) => {
          console.log(err);
          res.status(400).send("Something went wrong");
        });
    },
  };
};

module.exports = controller;

const async = require("async");
const Video = require("../shared/models").Video;
const { exec } = require("child_process");
const path = require('path');
const VIDEOWIKI_WHATSAPP_NUMBER = process.env.VIDEOWIKI_WHATSAPP_NUMBER;
const fs = require("fs");

const {
  articleService,
  userService,
  authService,
  emailService,
  organizationService,
} = require("../shared/services");

const { parseTranscription, parseSubtitle } = require("./transcribeParser");

const {
  supportedTranscribeLangs,
  DEFAULT_SINGLESLIDE_ENDTIME,
} = require("./constants");

module.exports = ({ workers }) => {
  const { transcriberWorker, whatsappBotWorker } = workers;

  function downloadFile(url, targetPath) {
    return new Promise((resolve, reject) => {
      // https://tailoredvideowiki.s3.eu-west-1.amazonaws.com/videos/1.mp4
      exec(`wget ${url} -O ${targetPath}`, (err) => {
        if (err) {
          return reject(err);
        }
        // ffmpeg emits warn messages on stderr, omit it and check if the file exists
        if (!fs.existsSync(targetPath)) {
          return reject(new Error("Failed to download file"));
        }
        return resolve(targetPath);
      });
    });
  }

  function applySubtitlesOnArticle(articleId, subtitlesUrl) {
    return new Promise((resolve, reject) => {
      console.log("applying subtitles on article", articleId, subtitlesUrl);
      const subtitlesPath = `./tmp/subtitles-${Date.now()}.${subtitlesUrl
        .split(".")
        .pop()}`;
      let subtitlesText = "";
      let parsedSubtitles = [];
      console.log(subtitlesUrl);
      downloadFile(subtitlesUrl, subtitlesPath)
        .then(() => {
          subtitlesText = fs.readFileSync(subtitlesPath).toString();
          parsedSubtitles = parseSubtitle(subtitlesText);
          return articleService.findById(articleId);
        })
        .then((article) => {
          if (!article) throw new Error('Invalid article id ' + articleId);

          const slides = [];
          parsedSubtitles.forEach((subtitle, index) => {
            slides.push({
              position: index,
              content: [
                {
                  text: subtitle.content, 
                  position: 0,
                  startTime: subtitle.startTime,
                  endTime: subtitle.endTime,
                  speakerProfile: {
                    speakerNumber: 1,
                    speakerGender: "male",
                  },
                },
              ],
            });
          });
          articleService.updateById(articleId, { slides })
        })
        .then(() => articleService.findById(articleId))
        .then(resolve)
        .catch(reject);
    });
  }

  function applyTranscriptionOnArticle(articleId, transcriptionUrl) {
    return new Promise((resolve, reject) => {
      console.log(
        "applying transcription on article",
        articleId,
        transcriptionUrl
      );
      const transcriptionPath = path.join(__dirname, `transcription-${Date.now()}.${transcriptionUrl
        .split(".")
        .pop()}`);
      downloadFile(transcriptionUrl, transcriptionPath)
        .then(() => {
          return articleService.findById(articleId);
        })
        .then((a) => {
          const subslides = a.slides.reduce((acc, s) => {
            const filteredContent = s.content.filter(
              (ss) =>
                ss.speakerProfile && ss.speakerProfile.speakerNumber !== -1
            );
            return acc.concat(
              filteredContent.map((ss) => ({
                ...ss,
                slidePosition: s.position,
                subslidePosition: ss.position,
              }))
            );
          }, []);
          const subslidesTranscriptions = parseTranscription(
            require(transcriptionPath),
            subslides
          );
          const updateSubslidesFuncArray = [];
          subslidesTranscriptions.forEach((st) => {
            updateSubslidesFuncArray.push((cb) => {
              // Dont update text if it has been already updated by the user
              const text =
                subslides[st.index].text && subslides[st.index].text.trim()
                  ? subslides[st.index].text.trim()
                  : st.text;
              articleService
                .updateSubslideUsingPosition(
                  articleId,
                  subslides[st.index].slidePosition,
                  subslides[st.index].subslidePosition,
                  { text, AITranscriptionLoading: false }
                )
                .then(() => {
                  cb();
                })
                .catch((err) => {
                  cb();
                  console.log(err);
                });
            });
          });
          async.parallelLimit(updateSubslidesFuncArray, 5, () => {
            console.log("Updated article using transcription");
            fs.unlink(transcriptionPath, () => {});
            resolve();
          });
        })
        .catch((err) => {
          console.log(err);
          fs.unlink(transcriptionPath, () => {});
          return reject(err);
        });
    });
  }

  function generateOriginalArticle({ videoId, cuttingBy, user }) {
    return new Promise((resolve, reject) => {
      let video;
      let originalArticle;
      Video.findById(videoId)
        .then((v) => {
          video = v;
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

          return articleService.create(newArticle).then((newArticle) => {
            originalArticle = newArticle;
            const videoUpdate = {
              status: "cutting",
              article: newArticle._id,
              cuttingBy: cuttingBy || "self",
              cuttingRequestBy: user._id,
            };
            if (cuttingBy === "videowiki") {
              videoUpdate.cuttingStartTime = Date.now();
              videoUpdate.cuttingEndTime =
                Date.now() + TIME_FOR_VIDEOWIKI_TO_CUT;
            }
            return Video.update({ _id: video._id }, { $set: videoUpdate });
          });
        })
        .then(() => {
          resolve(originalArticle);
        })
        .catch(reject);
    });
  }

  function getVideoWithRelatedUsers(videoId, extraFields) {
    return new Promise((resolve, reject) => {
      let video;
      const usersMap = {};
      const q = Video.findById(videoId);
      if (extraFields && Array.isArray(extraFields)) {
        extraFields.forEach((field) => {
          q.select(`+${field}`);
        });
      }
      q.select("+transcriptionScriptContent")
        .then((videoDoc) => {
          video = videoDoc.toObject();
          const fetchUsersFuncArray = [];
          const fetchUsers = [
            { field: "uploadedBy", id: video.uploadedBy },
            { field: "reviewers", ids: video.reviewers },
            { field: "verifiers", ids: video.verifiers },
          ];
          video.reviewers = [];
          video.verifiers = [];
          video.uploadedBy = {};
          // console.log('fetch users', video)
          fetchUsers.forEach((p) => {
            if (p.id) {
              fetchUsersFuncArray.push((cb) => {
                if (usersMap[p.id]) {
                  return setTimeout(() => {
                    const user = usersMap[p.id];
                    video[p.field] = {
                      _id: user._id,
                      firstname: user.firstname,
                      lastname: user.lastname,
                      email: user.email,
                    };
                    cb();
                  });
                }
                userService
                  .findById(p.id)
                  .then((user) => {
                    usersMap[user._id] = user;
                    video[p.field] = {
                      _id: user._id,
                      firstname: user.firstname,
                      lastname: user.lastname,
                      email: user.email,
                    };
                    cb();
                  })
                  .catch((err) => {
                    video[p.id] = {};
                    console.log(err);
                    cb();
                  });
              });
            } else if (p.ids) {
              video[p.field] = [];
              p.ids.forEach((id) => {
                fetchUsersFuncArray.push((cb) => {
                  if (usersMap[id]) {
                    return setTimeout(() => {
                      const user = usersMap[id];
                      video[p.field].push({
                        _id: user._id,
                        firstname: user.firstname,
                        lastname: user.lastname,
                        email: user.email,
                      });
                      cb();
                    });
                  }
                  userService
                    .findById(id)
                    .then((user) => {
                      usersMap[id] = user;
                      video[p.field].push({
                        _id: user._id,
                        firstname: user.firstname,
                        lastname: user.lastname,
                        email: user.email,
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

          async.parallelLimit(fetchUsersFuncArray, 5, () => {
            return resolve(video);
          });
        })
        .catch(reject);
    });
  }
  function genrateTranscribeMessage(video) {
    return {
      videoId: video._id,
      videoUrl: video.url,
      langCode: video.langCode,
      withSubtitle: video.withSubtitle,
      numberOfSpeakers: video.numberOfSpeakers,
      subtitlesUrl: video.subtitle,
      subtitleType: video.subtitleType,
    };
  }

  function canVideoAITranscribe(video) {
    return (
      supportedTranscribeLangs.map((l) => l.code).indexOf(video.langCode) !== -1
    );
  }

  const transcribeVideosQueue = () =>
    async.queue(({ skip, limit, organization }, callback) => {
      console.log(skip, limit);
      Video.find({ organization, status: "uploaded" })
        .skip(skip)
        .limit(limit)
        .then((videos) => {
          if (videos.length === 0) {
            return callback();
          }
          const reviewVideoFuncArray = [];
          videos.forEach((video) => {
            reviewVideoFuncArray.push((cb) => {
              // If it's a supported transcribe lang, transcribe it
              // otherwise, create a dummy article and let the user fill in the text
              if (
                supportedTranscribeLangs
                  .map((l) => l.code)
                  .indexOf(video.langCode) !== -1
              ) {
                transcriberWorker.transcribeVideo(
                  genrateTranscribeMessage(video)
                );
                Video.update(
                  { _id: video._id },
                  { $set: { status: "transcriping" } }
                )
                  .then(() => {
                    cb();
                  })
                  .catch((err) => {
                    console.log(err);
                    cb();
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
                  .then((newArticle) => {
                    return Video.update(
                      { _id: video._id },
                      {
                        $set: {
                          status: "proofreading",
                          article: newArticle._id,
                        },
                      }
                    );
                  })
                  .then(() => {
                    cb();
                  })
                  .catch((err) => {
                    console.log(err);
                    cb();
                  });
              }
            });
          });
          async.parallelLimit(reviewVideoFuncArray, 10, (err) => {
            console.log(err);
            return callback();
          });
        })
        .catch((err) => {
          console.log(err);
          return callback(err);
        });
    });

  function notifyUserVideoProofreadingReady(videoId) {
    let video;
    let user;
    let organization;

    whatsappBotWorker.whatsappNotifyUserVideoProofreadingReady({
      videoId: videoId,
    });
    Video.findById(videoId)
      .then((v) => {
        video = v;
        return userService.findById(video.cuttingRequestBy);
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
        return emailService.notifyUserVideoProofreadingReady({
          to: user,
          organizationName: organization.name,
          videoTitle: video.title,
          videoId: video._id,
          organizationId: organization._id,
          inviteToken: token,
        });
      })
      .catch((err) => {
        console.log(err);
      });
  }
  function notifyUserAITranscriptionFinished(articleId) {
    let video;
    let users;
    let article;
    let organization;
    articleService
      .findById(articleId)
      .then((a) => {
        article = a;
        return Video.findById(article.video);
      })
      .then((v) => {
        video = v.toObject();
        return organizationService.findById(video.organization);
      })
      .then((o) => {
        organization = o;
        users = article.AITranscriptionFinishSubscribers;
        if (users && users.length > 0) {
          users.forEach((userId) => {
            let user;
            userService
              .findById(userId)
              .then((u) => {
                user = u;
                return authService.generateLoginToken(user._id);
              })
              .then((token) => {
                const params = {
                  to: user,
                  inviteToken: token,
                  videoTitle: video.title,
                  videoId: video._id,
                  organizationId: organization._id,
                  organizationName: organization.name,
                };
                console.log(params);
                return emailService.notifyUserAITranscriptionFinish(params);
              })
              .catch((err) => {
                console.log(err);
              });
          });
        }
      })
      .catch((err) => {
        console.log(err);
      });
  }

  function generateWhatsappTranscribeLink(videoId) {
    return `https://wa.me/${VIDEOWIKI_WHATSAPP_NUMBER}?text=${`hi breakvideo-${videoId}`}`;
  }

  function generateWhatsappProofreadLink(videoId) {
    return `https://wa.me/${VIDEOWIKI_WHATSAPP_NUMBER}?text=${`hi transcribevideo-${videoId}`}`;
  }

  function generateWhatsappTranslateLink(videoId, langTo) {
    return `https://wa.me/${VIDEOWIKI_WHATSAPP_NUMBER}?text=${`hi translatevideo-${videoId}-${langTo}`}`;
  }

  function getWhatsappNotifyOnProofreadingReady(videoId) {
    return `https://wa.me/${VIDEOWIKI_WHATSAPP_NUMBER}?text=${`hi notifyonproofreadingready-${videoId}`}`;
  }
  return {
    notifyUserVideoProofreadingReady,
    transcribeVideosQueue,
    canVideoAITranscribe,
    getVideoWithRelatedUsers,
    genrateTranscribeMessage,
    applyTranscriptionOnArticle,
    generateWhatsappProofreadLink,
    generateWhatsappTranscribeLink,
    generateWhatsappTranslateLink,
    getWhatsappNotifyOnProofreadingReady,
    notifyUserAITranscriptionFinished,
    generateOriginalArticle,
    applySubtitlesOnArticle,
  };
};

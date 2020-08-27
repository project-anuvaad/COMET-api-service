const {
  articleService,
  videoService,
  translationService,
} = require("../shared/services");

let translationWorker;
const TRANSLATE_ARTICLE_TEXT_QUEUE = "TRANSLATE_ARTICLE_TEXT_QUEUE";
const UPDATE_ARTICLE_SLIDE_VIDEO_SPEED_FINISH =
  "UPDATE_ARTICLE_SLIDE_VIDEO_SPEED_FINISH";
const UPDATE_ARTICLE_VIDEO_SPEED_FINISH = "UPDATE_ARTICLE_VIDEO_SPEED_FINISH";

const UPDATE_ARTICLE_SLIDE_VIDEO_SLICE_FINISH =
  "UPDATE_ARTICLE_SLIDE_VIDEO_SLICE_FINISH";

const WHATSAPP_TRANSLATION_STARTED_QUEUE = "WHATSAPP_TRANSLATION_STARTED_QUEUE";
const WHATSAPP_TRANSLATION_TEXT_CHANGED_QUEUE =
  "WHATSAPP_TRANSLATION_TEXT_CHANGED_QUEUE";
const WHATSAPP_TRANSLATION_AUDIO_CHANGED_QUEUE =
  "WHATSAPP_TRANSLATION_AUDIO_CHANGED_QUEUE";

const async = require("async");

let rabbitmqChannel;

function init({ channel, workers }) {
  rabbitmqChannel = channel;
  translationWorker = workers.translationWorker;

  console.log("rabbitmq started");
  rabbitmqChannel.assertQueue(TRANSLATE_ARTICLE_TEXT_QUEUE, {
    durable: true,
  });
  rabbitmqChannel.consume(
    TRANSLATE_ARTICLE_TEXT_QUEUE,
    onTranslateArticleText,
    { noAck: false }
  );

  rabbitmqChannel.assertQueue(WHATSAPP_TRANSLATION_STARTED_QUEUE, {
    durable: true,
  });
  rabbitmqChannel.consume(
    WHATSAPP_TRANSLATION_STARTED_QUEUE,
    onWhatsappTranslationStarted,
    { noAck: false }
  );

  rabbitmqChannel.assertQueue(WHATSAPP_TRANSLATION_TEXT_CHANGED_QUEUE, {
    durable: true,
  });
  rabbitmqChannel.consume(
    WHATSAPP_TRANSLATION_TEXT_CHANGED_QUEUE,
    onWhatsappTranslationTextChanged,
    { noAck: false }
  );

  rabbitmqChannel.assertQueue(WHATSAPP_TRANSLATION_AUDIO_CHANGED_QUEUE, {
    durable: true,
  });
  rabbitmqChannel.consume(
    WHATSAPP_TRANSLATION_AUDIO_CHANGED_QUEUE,
    onWhatsappTranslationAudioChanged,
    { noAck: false }
  );

  rabbitmqChannel.assertQueue(UPDATE_ARTICLE_SLIDE_VIDEO_SLICE_FINISH, {
    durable: true,
  });
  rabbitmqChannel.consume(
    UPDATE_ARTICLE_SLIDE_VIDEO_SLICE_FINISH,
    onUpdateArticleSlideVideoSliceFinish,
    { noAck: false }
  );

  rabbitmqChannel.assertQueue(UPDATE_ARTICLE_SLIDE_VIDEO_SPEED_FINISH, {
    durable: true,
  });

  rabbitmqChannel.consume(
    UPDATE_ARTICLE_SLIDE_VIDEO_SPEED_FINISH,
    onUpdateArticleSlideVideoSpeedFinish,
    { noAck: false }
  );

  rabbitmqChannel.assertQueue(UPDATE_ARTICLE_VIDEO_SPEED_FINISH, {
    durable: true,
  });

  rabbitmqChannel.consume(
    UPDATE_ARTICLE_VIDEO_SPEED_FINISH,
    onUpdateArticleVideoSpeedFinish,
    { noAck: false }
  );
}

function parseMessageContent(msg) {
  return JSON.parse(msg.content.toString());
}

function onUpdateArticleVideoSpeedFinish(msg) {
  const {
    id,
    status,
    slidesUpdate,
  } = parseMessageContent(msg);

  console.log('onUpdateArticleVideoSpeedFinish ', id, status)
  rabbitmqChannel.ack(msg);
  if (status === "failed") {
    return articleService
      .findByIdAndUpdate(id, { videoSpeedLoading: false })
      .then(() => {
        console.log("onUpdateArticleSlideVideoSpeedFinish failed in exporter");
      })
      .catch((err) => {
        console.log(err);
      });
  } else {
    slidesUpdate.videoSpeedLoading = false;
    articleService
      .findByIdAndUpdate(id, slidesUpdate)
      .then(() => {
        console.log("updated video speed", id);
      })
      .catch((err) => {
        console.log(err);
      });
  }
}

function onUpdateArticleSlideVideoSpeedFinish(msg) {
  const {
    id,
    status,
    slidePosition,
    subslidePosition,
    slidesUpdate,
  } = parseMessageContent(msg);

  console.log("onUpdateArticleSlideVideoSpeedFinish ", id, status);
  rabbitmqChannel.ack(msg);
  if (status === "failed") {
    return articleService
      .findByIdAndUpdate(id, { videoSpeedLoading: false })
      .then(() => {
        console.log("onUpdateArticleSlideVideoSpeedFinish failed in exporter");
      })
      .catch((err) => {
        console.log(err);
      });
  } else {
    slidesUpdate.videoSpeedLoading = false;
    articleService
      .findByIdAndUpdate(id, slidesUpdate)
      .then(() => {
        console.log("updated video speed", id);
      })
      .catch((err) => {
        console.log(err);
      });
  }
}

function onUpdateArticleSlideVideoSliceFinish(msg) {
  const {
    id,
    status,
    slidePosition,
    subslidePosition,
    startTime,
    endTime,
    duration,
    mediaKey,
    url,
  } = parseMessageContent(msg);

  console.log("onUpdateArticleSlideVideoSliceFinish", id);
  console.log(parseMessageContent(msg));
  rabbitmqChannel.ack(msg);

  if (status === "failed") {
    return articleService
      .update({ _id: id }, { videoSliceLoading: false })
      .then(() => {
        console.log("updating video slice failed at exporter", id);
      })
      .catch((err) => {
        console.log(err);
      });
  } else {
    const slidesUpdate = {
      videoSliceLoading: false,
    };
    // Perform database update for target subslide
    /*
        Updated fields:
        1- startTime
        2- endTime
        3- media[0].duration
        4- media[0].mediaKey
        5- media[0].url
    */
    const targetSubslideUpdateField = `slides.${slidePosition}.content.${subslidePosition}`;

    slidesUpdate[`${targetSubslideUpdateField}.startTime`] = startTime;
    slidesUpdate[`${targetSubslideUpdateField}.endTime`] = endTime;
    slidesUpdate[`${targetSubslideUpdateField}.media.0.duration`] = duration;
    slidesUpdate[`${targetSubslideUpdateField}.media.0.mediaKey`] = mediaKey;
    slidesUpdate[`${targetSubslideUpdateField}.media.0.url`] = url;
    articleService
      .updateById(id, slidesUpdate)
      .then(() => {})
      .catch((err) => {
        console.log(err);
      });
  }
}

function onTranslateArticleText(msg) {
  rabbitmqChannel.ack(msg);
  const { articleId, lang } = parseMessageContent(msg);
  let article;
  console.log("translate article request", articleId, lang);
  articleService
    .findById(articleId)
    .then((articleDoc) => {
      if (!articleDoc) throw new Error("Invalid article id");
      article = articleDoc.toObject();
      return new Promise((resolve) => {
        article.articleType = "translation";
        const translationFuncArray = [];
        let totalTranslateCount = article.slides.reduce(
          (acc, slide) =>
            acc + slide.content.filter((c) => c.text.trim().length > 0).length,
          0
        );
        let doneCount = 0;
        article.slides.forEach((slide) => {
          slide.content.forEach((subslide) => {
            if (
              subslide.speakerProfile &&
              subslide.speakerProfile.speakerNumber === -1
            ) {
              console.log("");
            } else {
              subslide.audio = "";
            }
            if (subslide.text && subslide.text.trim().length > 0) {
              translationFuncArray.push((cb) => {
                translationService
                  .translateText(subslide.text, lang)
                  .then((translatedText) => {
                    doneCount++;
                    subslide.text = translatedText;
                    updateTranslationProgress(
                      articleId,
                      Math.floor((doneCount / totalTranslateCount) * 100),
                      () => {
                        cb();
                      }
                    );
                  })
                  .catch((err) => {
                    console.log("error translating subslide", err);
                    subslide.text = "";
                    cb();
                  });
              });
            } else {
              subslide.text = "";
            }
          });
        });

        async.series(translationFuncArray, (err) => {
          if (err) {
            console.log("error translating", err);
          }
          resolve(article);
        });
      })
        .then((article) => {
          articleService
            .updateById(articleId, {
              slides: article.slides,
              langCode: lang,
              translationProgress: 100,
            })
            .then(() => {
              updateTranslationProgress(articleId, 100, () => {});
            })
            .catch((err) => {
              throw err;
            });
        })
        .catch((err) => {
          console.log("Errror translating article", err);
          article.slides.forEach((slide) => {
            slide.content.forEach((subslide) => {
              subslide.audio = "";
              subslide.text = "";
            });
          });
          articleService
            .updateById(articleId, {
              slides: article.slides,
              langCode: lang,
              translationProgress: 100,
            })
            .then(() => {
              updateTranslationProgress(articleId, 100, () => {});
            })
            .catch((err) => {
              console.log("error updating slides", err);
              updateTranslationProgress(articleId, 100, () => {});
            });
        });
    })
    .catch((err) => {
      console.log(err);
      updateTranslationProgress(articleId, 100, () => {});
    });
}

function updateTranslationProgress(
  articleId,
  translationProgress,
  callback = () => {}
) {
  articleService
    .updateById(articleId, { translationProgress })
    .then(() => {
      console.log("updated progress", translationProgress);
      callback();
    })
    .catch((err) => {
      console.log("error updating progress", err);
      callback(err);
    });
}

function onWhatsappTranslationStarted(msg) {
  const { videoId, langTo, contactNumber, action } = parseMessageContent(msg);
  rabbitmqChannel.ack(msg);
  let video;
  console.log("onWhatsappTranslationStarted", parseMessageContent(msg));
  videoService
    .findById(videoId)
    .then((v) => {
      video = v;
      if (!v) throw new Error("Invalid video id");
      return articleService.findOne({
        articleType: "translation",
        video: videoId,
        langCode: langTo,
        $or: [{ tts: false }, { tts: { $exists: false } }],
      });
    })
    .then((translationArticle) => {
      if (action && translationArticle && translationArticle._id) {
        throw new Error("Already Started");
      }
      return new Promise((resolve, reject) => {
        if (!translationArticle || !translationArticle._id) {
          console.log("creating translation article", {
            articleId: video.article,
            lang: langTo,
          });
          // create new translation article
          return articleService
            .generateTranslatableArticle({
              articleId: video.article,
              lang: langTo,
            })
            .then(({ article, created }) => {
              if (created) {
                translationWorker.translateArticleText({
                  articleId: article._id,
                  lang: langTo,
                });
              }
              resolve(article);
            })
            .catch((err) => {
              reject(err);
            });
        }
        return resolve(translationArticle);
      });
    })
    .then((translationArticle) => {
      // If it's not an action ( hi translation-asdasdas-langTo ) then create a translation version
      if (!action) {
        // Create translation version
        articleService
          .cloneArticle(translationArticle._id)
          .then((clonedArticle) => {
            clonedArticle.slides.forEach((slide) => {
              slide.content.forEach((subslide) => {
                if (
                  subslide.speakerProfile &&
                  subslide.speakerProfile.speakerNumber !== -1
                ) {
                  subslide.audio = "";
                }
              });
            });
            const newArticleUpdate = {
              articleType: "translation_version",
              translationArticle: translationArticle._id,
              originalArticle: translationArticle.originalArticle,
              langCode: langTo,
              slides: clonedArticle.slides,
              translationProgress: 100,
              archived: false,
              translationVersionBy: contactNumber,
            };
            clonedArticle = {
              ...clonedArticle,
              ...newArticleUpdate,
            };
            return articleService.update(
              { _id: clonedArticle._id },
              newArticleUpdate
            );
          })
          .then(() => {})
          .catch((err) => {
            console.log(err);
          });
      }
    })
    .catch((err) => {
      console.log(err);
    });
}

function onWhatsappTranslationTextChanged(msg) {
  const {
    videoId,
    langTo,
    text,
    contactNumber,
    slidePosition,
    subslidePosition,
    action,
    // completed,
  } = parseMessageContent(msg);
  console.log("onWhatsappTranslationTextChanged", parseMessageContent(msg));
  rabbitmqChannel.ack(msg);
  articleService
    .findOne({
      video: videoId,
      articleType: "translation",
      langCode: langTo,
      $or: [{ archived: false }, { archived: { $exists: false } }],
    })
    .then((translationArticle) => {
      // IF is actioned translation, update directly on the current translation
      if (action) {
        articleService
          .updateSubslideUsingPosition(
            translationArticle._id,
            parseInt(slidePosition),
            parseInt(subslidePosition),
            { text }
          )
          .then(() => {
            console.log(
              "onWhatsappTranslationTextChanged updated on original article"
            );
          })
          .catch((err) => {
            console.log(err);
          });
        return;
      }
      articleService
        .findOne({
          video: videoId,
          langCode: langTo,
          translationArticle: translationArticle._id,
          translationVersionBy: contactNumber,
          articleType: "translation_version",
        })
        .then((translationVersion) => {
          return articleService.updateSubslideUsingPosition(
            translationVersion._id,
            parseInt(slidePosition),
            parseInt(subslidePosition),
            { text }
          );
        })
        .then(() => {
          console.log(
            "onWhatsappTranslationTextChanged updated on translation version"
          );
        })
        .catch((err) => {
          console.log(err);
        });
    })
    .catch((err) => {
      console.log(err);
    });
}

function onWhatsappTranslationAudioChanged(msg) {
  const {
    videoId,
    langTo,
    audioUrl,
    // contactNumber,
    slidePosition,
    subslidePosition,
    // action,
    // completed,
  } = parseMessageContent(msg);
  console.log("onWhatsappTranslationAudioChanged", parseMessageContent(msg));
  rabbitmqChannel.ack(msg);
  articleService
    .findOne({
      video: videoId,
      articleType: "translation",
      langCode: langTo,
      $or: [{ archived: false }, { archived: { $exists: false } }],
    })
    .then((translationArticle) => {
      articleService
        .updateSubslideUsingPosition(
          translationArticle._id,
          parseInt(slidePosition),
          parseInt(subslidePosition),
          { audio: audioUrl }
        )
        .then(() => {
          console.log(
            "onWhatsappTranslationAudioChanged updated on original article"
          );
        })
        .catch((err) => {
          console.log(err);
        });
      return;
      // IF is actioned translation, update directly on the current translation
      // if (action) {
      //     articleService.updateSubslideUsingPosition(translationArticle._id, parseInt(slidePosition), parseInt(subslidePosition), { audio: audioUrl })
      //     .then(() => {
      //         console.log('onWhatsappTranslationTextChanged updated on original article')
      //     })
      //     .catch(err => {
      //         console.log(err);
      //     })
      //     return;
      // }
      // articleService.findOne({ video: videoId, langCode: langTo, translationArticle: translationArticle._id, translationVersionBy: contactNumber, articleType: 'translation_version' })
      // .then((translationVersion) => {
      //     return articleService.updateSubslideUsingPosition(translationVersion._id, parseInt(slidePosition), parseInt(subslidePosition), { audio: audioUrl });
      // })
      // .then(() => {
      //     console.log('onWhatsappTranslationTextChanged updated on translation version')
      // })
      // .catch(err => {
      //     console.log(err);
      // })
    })
    .catch((err) => {
      console.log(err);
    });
}

module.exports = {
  init,
};
